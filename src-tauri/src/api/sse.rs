use crate::error::{AppError, AppResult};

const MAX_BUFFER: usize = 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SseFrame {
    pub event: String,
    pub data: String,
}

/// Incremental SSE frame parser. It buffers raw bytes so a multi-byte UTF-8
/// character split across network chunks is never decoded incorrectly.
#[derive(Default)]
pub struct SseParser {
    buffer: Vec<u8>,
}

impl SseParser {
    pub fn push(&mut self, chunk: &[u8]) -> AppResult<Vec<SseFrame>> {
        self.buffer.extend_from_slice(chunk);
        if self.buffer.len() > MAX_BUFFER {
            self.buffer.clear();
            return Err(AppError::Message(
                "SSE event exceeded the desktop buffer limit".to_string(),
            ));
        }

        let mut frames = Vec::new();
        while let Some((index, separator_len)) = find_separator(&self.buffer) {
            let frame = self.buffer[..index].to_vec();
            self.buffer.drain(..index + separator_len);
            if let Some(parsed) = parse_frame(&frame) {
                frames.push(parsed);
            }
        }
        Ok(frames)
    }
}

fn find_separator(buffer: &[u8]) -> Option<(usize, usize)> {
    let mut best: Option<(usize, usize)> = None;
    for (needle, len) in [
        (b"\r\n\r\n".as_slice(), 4),
        (b"\n\n".as_slice(), 2),
        (b"\r\r".as_slice(), 2),
    ] {
        if let Some(index) = find_bytes(buffer, needle) {
            if best.is_none_or(|(current, _)| index < current) {
                best = Some((index, len));
            }
        }
    }
    best
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn parse_frame(frame: &[u8]) -> Option<SseFrame> {
    let text = String::from_utf8_lossy(frame);
    let mut event = "message".to_string();
    let mut data_lines = Vec::new();
    for line in text.split('\n') {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if line.is_empty() || line.starts_with(':') {
            continue;
        }
        let (field, value) = match line.split_once(':') {
            Some((field, value)) => (field, value.strip_prefix(' ').unwrap_or(value)),
            None => (line, ""),
        };
        match field {
            "event" if !value.is_empty() => event = value.to_string(),
            "data" => data_lines.push(value),
            _ => {}
        }
    }
    if data_lines.is_empty() {
        return None;
    }
    Some(SseFrame {
        event,
        data: data_lines.join("\n"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_frames_split_across_chunks() {
        let mut parser = SseParser::default();
        assert!(parser.push(b"event: log\nda").unwrap().is_empty());
        let frames = parser.push("ta: Привет\n\n".as_bytes()).unwrap();
        assert_eq!(
            frames,
            vec![SseFrame {
                event: "log".to_string(),
                data: "Привет".to_string(),
            }]
        );
    }

    #[test]
    fn parses_multiline_data_and_crlf() {
        let mut parser = SseParser::default();
        let frames = parser
            .push(b"event: log\r\ndata: one\r\ndata: two\r\n\r\n")
            .unwrap();
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].data, "one\ntwo");
    }

    #[test]
    fn ignores_comments_and_events_without_data() {
        let mut parser = SseParser::default();
        assert!(parser
            .push(b": heartbeat\n\nevent: empty\n\n")
            .unwrap()
            .is_empty());
    }
}
