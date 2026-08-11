import SwiftUI

struct AppShellView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var store: StoreService

    var body: some View {
        ZStack {
            EndpaperField()
            if model.isLoading && model.projects.isEmpty {
                VStack(spacing: 16) {
                    StoryMark()
                    ProgressView()
                        .tint(StoryTheme.recorderTeal)
                }
            } else {
                TabView(selection: $model.selectedTab) {
                    NavigationStack {
                        StoryShelfView()
                    }
                    .tag(AppModel.Tab.shelf)
                    .tabItem { Label("Projects", systemImage: "books.vertical") }

                    NavigationStack {
                        QuestionsView()
                    }
                    .tag(AppModel.Tab.questions)
                    .tabItem { Label("Questions", systemImage: "quote.bubble") }

                    NavigationStack {
                        FamilyView()
                    }
                    .tag(AppModel.Tab.family)
                    .tabItem { Label("Account", systemImage: "person.2") }
                }
                .toolbarBackground(StoryTheme.paper.opacity(0.98), for: .tabBar)
                .toolbarBackground(.visible, for: .tabBar)
            }
        }
        .task {
            await model.bootstrap()
            await store.recoverUnfinished()
        }
        .task(id: store.unfulfilledTransactionIDs) {
            for proof in store.unfulfilledProofs {
                if await model.fulfillPurchase(proof) {
                    await store.finish(transactionID: proof.transactionID)
                }
            }
        }
        .alert("A quick note", isPresented: errorBinding) {
            Button("Okay", role: .cancel) { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "")
        }
        .alert("Saved", isPresented: confirmationBinding) {
            Button("Done", role: .cancel) { model.confirmationMessage = nil }
        } message: {
            Text(model.confirmationMessage ?? "")
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )
    }

    private var confirmationBinding: Binding<Bool> {
        Binding(
            get: { model.confirmationMessage != nil },
            set: { if !$0 { model.confirmationMessage = nil } }
        )
    }
}
