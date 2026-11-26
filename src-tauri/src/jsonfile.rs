use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::error::AppResult;

/// Writes pretty JSON through a temporary file and a best-effort replace.
///
/// The desktop settings file, the reminder watermark and any future small
/// state files share one write path: create the parent, write `*.json.tmp`,
/// then replace the destination. Windows cannot rename over an existing file,
/// so it is removed first there; that leaves a short window where the file is
/// absent, so this is not a true atomic replace, but readers never observe a
/// partially written file.
pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let raw = serde_json::to_vec_pretty(value)?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, raw)?;
    #[cfg(windows)]
    {
        // Windows rename does not replace an existing destination.
        if path.exists() {
            fs::remove_file(path)?;
        }
    }
    fs::rename(&temporary, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn creates_parents_and_replaces_an_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested/state.json");
        write_json_atomic(&path, &json!({"value": 1})).unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&fs::read_to_string(&path).unwrap()).unwrap(),
            json!({"value": 1})
        );

        write_json_atomic(&path, &json!({"value": 2})).unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&fs::read_to_string(&path).unwrap()).unwrap(),
            json!({"value": 2})
        );
        assert!(!path.with_extension("json.tmp").exists());
    }
}
