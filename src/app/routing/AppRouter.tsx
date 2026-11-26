import { HashRouter, Route, Routes } from "react-router-dom";
import type { RootStore } from "@/app/model/RootStore";
import { AppLayout } from "@/app/layout/AppLayout";
import { ActivityPage } from "@/pages/activity";
import { ConnectionDetailPage } from "@/pages/connection-detail";
import { ConnectionWizardPage } from "@/pages/connection-wizard";
import { ConnectionsPage } from "@/pages/connections";
import { DashboardPage } from "@/pages/dashboard";
import { GitSyncPage } from "@/pages/git-sync";
import { IdeasPage } from "@/pages/ideas";
import { InboxPage, ProposalDetailPage } from "@/pages/inbox";
import { MemoryPage, RecordDetailPage } from "@/pages/memory";
import { NotFoundPage } from "@/pages/not-found";
import { ProjectDetailPage } from "@/pages/project-detail";
import { ProjectsPage } from "@/pages/projects";
import { QuarantinePage } from "@/pages/quarantine";
import { SearchPage } from "@/pages/search";
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
                ideas={store.ideas}
              />
            }
          />
          <Route
            path="ideas"
            element={
              <IdeasPage
                ideas={store.ideas}
                projects={store.projects}
                exportSource={store.ideasExport}
              />
            }
          />
          <Route
            path="memory"
            element={
              <MemoryPage
                memory={store.memory}
                projects={store.projects}
                engine={store.engine}
              />
            }
          />
          <Route
            path="memory/:kind/:id"
            element={
              <RecordDetailPage
                memory={store.memory}
                projects={store.projects}
                engine={store.engine}
              />
            }
          />
          <Route
            path="inbox"
            element={
              <InboxPage
                review={store.review}
                projects={store.projects}
                engine={store.engine}
              />
            }
          />
          <Route
            path="inbox/proposal/:project/:id"
            element={
              <ProposalDetailPage
                review={store.review}
                engine={store.engine}
              />
            }
          />
          <Route
            path="quarantine"
            element={
              <QuarantinePage
                quarantine={store.quarantine}
                review={store.review}
                projects={store.projects}
                engine={store.engine}
              />
            }
          />
          <Route
            path="search"
            element={
              <SearchPage
                search={store.search}
                projects={store.projects}
                engine={store.engine}
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
            element={
              <ActivityPage
                runs={store.runs}
                memory={store.memory}
                projects={store.projects}
                connections={store.connections}
                engine={store.engine}
              />
            }
          />
          <Route
            path="projects"
            element={<ProjectsPage projects={store.projects} />}
          />
          <Route
            path="projects/:projectId"
            element={
              <ProjectDetailPage
                projects={store.projects}
                memory={store.memory}
                engine={store.engine}
              />
            }
          />
          <Route
            path="sync"
            element={<GitSyncPage gitSync={store.gitSync} />}
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
