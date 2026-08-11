#if DEBUG
import SwiftUI
import StorySittingCore

/// Debug-only entry points for App Store captures. They render the shipping
/// SwiftUI views with the same deterministic sample family used by previews and
/// tests; the production target still boots through AccountGateView.
struct AppStoreScreenshotRoot: View {
    @EnvironmentObject private var model: AppModel
    let mode: String

    var body: some View {
        Group {
            switch mode {
            case "project":
                NavigationStack {
                    StoryDetailView(projectID: "project_evelyn")
                }
            case "pricing":
                ChapterPurchaseSheet(
                    projectID: "project_evelyn",
                    chapterID: "chapter_evelyn_2",
                    currentEdition: nil
                )
            default:
                AppShellView()
            }
        }
        .task { await model.bootstrap() }
    }
}
#endif
