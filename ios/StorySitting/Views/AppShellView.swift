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
                    .tabItem { Label("Stories", systemImage: "books.vertical.fill") }

                    NavigationStack {
                        QuestionsView()
                    }
                    .tag(AppModel.Tab.questions)
                    .tabItem { Label("Questions", systemImage: "quote.bubble.fill") }

                    NavigationStack {
                        FamilyView()
                    }
                    .tag(AppModel.Tab.family)
                    .tabItem { Label("Family", systemImage: "person.2.fill") }
                }
                .toolbarBackground(StoryTheme.paper.opacity(0.98), for: .tabBar)
                .toolbarBackground(.visible, for: .tabBar)
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if model.isSampleMode {
                HStack(spacing: 9) {
                    Image(systemName: "sparkles")
                    Text("Sample family")
                        .font(StoryTheme.FontBook.label(12))
                    Spacer()
                    Button("Exit") { model.endSample() }
                        .font(StoryTheme.FontBook.label(12))
                }
                .foregroundStyle(StoryTheme.recorderDark)
                .padding(.horizontal, 16)
                .frame(height: 38)
                .background(StoryTheme.butter.opacity(0.92))
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
