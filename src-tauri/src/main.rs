// Hide the console window in release Windows builds; the shell lives in the
// tray and the webview.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lv24_brain_desktop_lib::run()
}
