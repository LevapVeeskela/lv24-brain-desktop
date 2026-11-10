# Screenshot index

All captures use fictional local fixture data, not a live engine or native Tauri window.
Names specify the requested CSS viewport; actual image bitmap dimensions can be smaller through the capture API.
DOM dimensions and overflow checks are recorded in the JSON metrics.

## Before / after

Baseline commit: `6b2ca9d`. App versions and fixtures use the same fictional records.

| Page | EN 980×720 | EN 760×540 | RU 980×720 | RU 760×540 |
| --- | --- | --- | --- | --- |
| Dashboard | [before](before-dashboard-en-980x720.jpg) · [after](after-dashboard-en-980x720.jpg) | [before](before-dashboard-en-760x540.jpg) · [after](after-dashboard-en-760x540.jpg) | [before](before-dashboard-ru-980x720.jpg) · [after](after-dashboard-ru-980x720.jpg) | [before](before-dashboard-ru-760x540.jpg) · [after](after-dashboard-ru-760x540.jpg) |
| Connections | [before](before-connections-en-980x720.jpg) · [after](after-connections-en-980x720.jpg) | [before](before-connections-en-760x540.jpg) · [after](after-connections-en-760x540.jpg) | [before](before-connections-ru-980x720.jpg) · [after](after-connections-ru-980x720.jpg) | [before](before-connections-ru-760x540.jpg) · [after](after-connections-ru-760x540.jpg) |
| Wizard | [before](before-wizard-en-980x720.jpg) · [after](after-wizard-en-980x720.jpg) | [before](before-wizard-en-760x540.jpg) · [after](after-wizard-en-760x540.jpg) | [before](before-wizard-ru-980x720.jpg) · [after](after-wizard-ru-980x720.jpg) | [before](before-wizard-ru-760x540.jpg) · [after](after-wizard-ru-760x540.jpg) |
| Connection detail | [before](before-detail-en-980x720.jpg) · [after](after-detail-en-980x720.jpg) | [before](before-detail-en-760x540.jpg) · [after](after-detail-en-760x540.jpg) | [before](before-detail-ru-980x720.jpg) · [after](after-detail-ru-980x720.jpg) | [before](before-detail-ru-760x540.jpg) · [after](after-detail-ru-760x540.jpg) |
| Activity | [before](before-activity-en-980x720.jpg) · [after](after-activity-en-980x720.jpg) | [before](before-activity-en-760x540.jpg) · [after](after-activity-en-760x540.jpg) | [before](before-activity-ru-980x720.jpg) · [after](after-activity-ru-980x720.jpg) | [before](before-activity-ru-760x540.jpg) · [after](after-activity-ru-760x540.jpg) |
| Projects | [before](before-projects-en-980x720.jpg) · [after](after-projects-en-980x720.jpg) | [before](before-projects-en-760x540.jpg) · [after](after-projects-en-760x540.jpg) | [before](before-projects-ru-980x720.jpg) · [after](after-projects-ru-980x720.jpg) | [before](before-projects-ru-760x540.jpg) · [after](after-projects-ru-760x540.jpg) |
| Settings | [before](before-settings-en-980x720.jpg) · [after](after-settings-en-980x720.jpg) | [before](before-settings-en-760x540.jpg) · [after](after-settings-en-760x540.jpg) | [before](before-settings-ru-980x720.jpg) · [after](after-settings-ru-980x720.jpg) | [before](before-settings-ru-760x540.jpg) · [after](after-settings-ru-760x540.jpg) |

## Additional states and interaction evidence

- [RU overview, 980×720](overview-after-ru-980x720.jpg)
- [RU overview, 760×540](overview-after-ru-760x540.jpg)
- [Settings diagnostics](after-settings-diagnostics-ru-760x540.jpg)
- [Wizard Done](after-wizard-done-ru-760x540.jpg)
- [Received log output](after-log-ru-980x720.jpg)

| Page | Reflow 380×270 RU | Empty 760×540 RU | Error 760×540 RU | Loading 760×540 RU |
| --- | --- | --- | --- | --- |
| Dashboard | [reflow](reflow-dashboard-ru-380x270.jpg) | [empty](empty-dashboard-ru-760x540.jpg) | [error](error-dashboard-ru-760x540.jpg) | [loading](loading-dashboard-ru-760x540.jpg) |
| Connections | [reflow](reflow-connections-ru-380x270.jpg) | [empty](empty-connections-ru-760x540.jpg) | [error](error-connections-ru-760x540.jpg) | [loading](loading-connections-ru-760x540.jpg) |
| Wizard | [reflow](reflow-wizard-ru-380x270.jpg) | [empty](empty-wizard-ru-760x540.jpg) | [error](error-wizard-ru-760x540.jpg) | [loading](loading-wizard-ru-760x540.jpg) |
| Connection detail | [reflow](reflow-detail-ru-380x270.jpg) | [empty](empty-detail-ru-760x540.jpg) | [error](error-detail-ru-760x540.jpg) | [loading](loading-detail-ru-760x540.jpg) |
| Activity | [reflow](reflow-activity-ru-380x270.jpg) | [empty](empty-activity-ru-760x540.jpg) | [error](error-activity-ru-760x540.jpg) | [loading](loading-activity-ru-760x540.jpg) |
| Projects | [reflow](reflow-projects-ru-380x270.jpg) | [empty](empty-projects-ru-760x540.jpg) | [error](error-projects-ru-760x540.jpg) | [loading](loading-projects-ru-760x540.jpg) |
| Settings | [reflow](reflow-settings-ru-380x270.jpg) | [empty](empty-settings-ru-760x540.jpg) | [error](error-settings-ru-760x540.jpg) | [loading](loading-settings-ru-760x540.jpg) |

Reflow is equivalent layout coverage for 760×540 at 200%, not a claim of native zoom testing.
Settings diagnostics holds keychain states; its default tab shows preferences.

## Metrics

- [Before viewports](before-metrics.json)
- [After viewports](after-metrics.json)
- [Reflow viewports](reflow-metrics.json)
- [Empty/error/loading viewports](state-metrics.json)
- [Keyboard focus and target sizes](keyboard-metrics.json)
- [Interaction checks and native limitations](interaction-checks.json)
- [Actual bitmap dimensions](capture-manifest.json)

## Reproduce the local preview

```powershell
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:1420/scripts/design-preview.html?locale=ru&state=normal#/`.
Supported locales: `en`, `ru`; states: `normal`, `empty`, `error`, `loading`.
Routes: `/`, `/connections`, `/connections/new`, `/connections/github-team`, `/activity`, `/projects`, `/settings`.
Use viewport overrides 980×720, 760×540 and 380×270 CSS pixels; retain locale/viewport/phase in filenames.
For baseline captures, use the same fixture files against detached commit `6b2ca9d` in a separate worktree.
Do not change the current branch or real application state to reproduce fixtures.
