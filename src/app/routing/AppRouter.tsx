import { HashRouter, Route, Routes } from "react-router-dom";
import type { RootStore } from "@/app/model/RootStore";
import { AppLayout } from "@/app/layout/AppLayout";
import { ActivityPage } from "@/pages/activity";
import { ConnectionDetailPage } from "@/pages/connection-detail";
import { ConnectionWizardPage } from "@/pages/connection-wizard";
import { ConnectionsPage } from "@/pages/connections";
import { DashboardPage } from "@/pages/dashboard";
import { NotFoundPage } from "@/pages/not-found";
import { ProjectsPage } from "@/pages/projects";
import { SettingsPage } from "@/pages/settings";

export function AppRouter({ store }: { store: RootStore }) {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout store={store} />}>
          <Route
            index
            element={
              <DashboardPage
                engine={store.engine}
                connections={store.connections}
                sync={store.sync}
                settings={store.settings}
                runs={store.runs}
              />
            }
          />
          <Route
            path="connections"
            element={
              <ConnectionsPage
                connections={store.connections}
                engine={store.engine}
                runs={store.runs}
              />
            }
          />
          <Route
            path="connections/new"
            element={
              <ConnectionWizardPage
                connections={store.connections}
                projects={store.projects}
                providers={store.providers}
                engine={store.engine}
              />
            }
          />
          <Route
            path="connections/:id"
            element={
              <ConnectionDetailPage
                connections={store.connections}
                runs={store.runs}
                providers={store.providers}
                projects={store.projects}
                engine={store.engine}
              />
            }
          />
          <Route
            path="activity"
            element={<ActivityPage runs={store.runs} />}
          />
          <Route
            path="projects"
            element={<ProjectsPage projects={store.projects} />}
          />
          <Route
            path="settings"
            element={
              <SettingsPage
                engine={store.engine}
                settings={store.settings}
              />
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
