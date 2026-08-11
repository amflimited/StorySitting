import SwiftUI
import StorySittingCore

/// Sponsor-side Story Start. This screen can create and share a Family Pass, but
/// it has no capability to grant storyteller permission or schedule an AI call.
struct NextCallView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var store: StoreService
    @State private var selectedQuestionIDs: Set<String> = []
    @State private var sponsorAcknowledgedHandshake = false
    @State private var showingPurchase = false
    @State private var storyStarted = false
    @State private var statusCallID: String?
    let projectID: String

    var body: some View {
        ZStack {
            EndpaperField()
            if let project = model.project(id: projectID) {
                if storyStarted || statusCallID != nil || (project.latestCall?.isActive == true) {
                    sittingStatusView(project)
                } else {
                    planningView(project)
                }
            }
        }
        .navigationTitle("Story Start")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(StoryTheme.endpaper.opacity(0.98), for: .navigationBar)
        .task(id: projectID) {
            guard let project = model.project(id: projectID) else { return }
            selectedQuestionIDs = Set(project.questions.filter(\.isSelected).map(\.id))
            if project.latestCall?.isActive == true {
                statusCallID = project.latestCall?.id
            }
        }
        .sheet(isPresented: $showingPurchase) {
            if let project = model.project(id: projectID) {
                StoryStartPurchaseSheet(
                    project: project,
                    selectedQuestionIDs: Array(selectedQuestionIDs),
                    storyStarted: $storyStarted
                )
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
            }
        }
    }

    private func planningView(_ project: StoryProject) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 25) {
                VStack(alignment: .leading, spacing: 9) {
                    Eyebrow(text: project.calls.isEmpty ? "First sitting" : "Another deliberate sitting")
                    Text("Open a story with \(project.storyteller.familiarName).")
                        .font(StoryTheme.FontBook.display(38, weight: .medium))
                        .tracking(-1.05)
                        .foregroundStyle(StoryTheme.ink)
                    Text("You buy the beginning. They control whether the process continues. You decide about the finished result only after the preview.")
                        .font(StoryTheme.FontBook.body(14))
                        .foregroundStyle(StoryTheme.mutedInk)
                }

                transactionLedger
                questionPacking(project)
                handshakeLedger(project)
                sponsorAcknowledgment(project)

                Button { showingPurchase = true } label: {
                    FilledActionLabel(
                        title: "Pay \(store.displayPrice(for: .storyStart)) & open Story Start",
                        detail: "Creates a Family Pass · does not schedule an AI interview",
                        symbol: "arrow.right"
                    )
                }
                .buttonStyle(.plain)
                .disabled(!sponsorAcknowledgedHandshake)
                .opacity(sponsorAcknowledgedHandshake ? 1 : 0.42)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 18)
            .padding(.bottom, 34)
        }
    }

    private var transactionLedger: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeading(eyebrow: "The agreement", title: "Pay for progress, not a promise")
                .padding(.bottom, 12)
            ledgerRow("TODAY", store.displayPrice(for: .storyStart), "Open one Story Start and its Family Pass")
            ledgerRow("IF THEY DECLINE", "$0", "Nothing else is charged and no interview is scheduled")
            ledgerRow("AFTER AUTHORIZATION", "$0", "StorySitting conducts the call and prepares a private preview")
            ledgerRow("AFTER PREVIEW", "$39+", "Optional: choose Voice, Story, or Heirloom")
            ledgerRow("UPGRADE LATER", "Δ", "Pay only the difference between editions")
            ledgerRow("RECURRING", "$0", "No subscription and no automatic next sitting", isLast: true)
        }
    }

    private func ledgerRow(_ moment: String, _ price: String, _ detail: String, isLast: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(moment)
                .font(StoryTheme.FontBook.folio(8))
                .foregroundStyle(StoryTheme.mutedInk)
                .frame(width: 86, alignment: .leading)
            Text(price)
                .font(StoryTheme.FontBook.display(20))
                .foregroundStyle(StoryTheme.recorderTeal)
                .frame(width: 50, alignment: .leading)
            Text(detail)
                .font(StoryTheme.FontBook.body(11))
                .foregroundStyle(StoryTheme.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) {
            if !isLast { Divider().overlay(StoryTheme.hairline) }
        }
    }

    private func questionPacking(_ project: StoryProject) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(
                eyebrow: "If they grant permission",
                title: "A few ways in",
                trailing: "\(selectedQuestionIDs.count) PICKED"
            )
            Text("These are starting places, not a script. The storyteller can take the conversation elsewhere.")
                .font(StoryTheme.FontBook.body(11))
                .foregroundStyle(StoryTheme.mutedInk)

            ForEach(project.questions.filter { $0.answeredInChapterID == nil }.prefix(5)) { question in
                Button {
                    if selectedQuestionIDs.contains(question.id) {
                        selectedQuestionIDs.remove(question.id)
                    } else {
                        selectedQuestionIDs.insert(question.id)
                    }
                } label: {
                    HStack(alignment: .top, spacing: 11) {
                        Image(systemName: selectedQuestionIDs.contains(question.id) ? "checkmark.square.fill" : "square")
                            .foregroundStyle(selectedQuestionIDs.contains(question.id) ? StoryTheme.recorderTeal : StoryTheme.mutedInk)
                            .padding(.top, 2)
                        Text(question.prompt)
                            .font(StoryTheme.FontBook.editorial(15, weight: .medium))
                            .foregroundStyle(StoryTheme.ink)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer()
                    }
                    .padding(.vertical, 11)
                    .overlay(alignment: .bottom) { Divider().overlay(StoryTheme.hairline) }
                }
                .buttonStyle(.plain)
            }

            Button {
                Task {
                    await model.setSelectedQuestions(projectID: project.id, ids: selectedQuestionIDs)
                    model.selectedTab = .questions
                    dismiss()
                }
            } label: {
                Label("Open the full family question deck", systemImage: "arrow.right")
                    .font(StoryTheme.FontBook.label(12))
                    .foregroundStyle(StoryTheme.recorderTeal)
            }
        }
    }

    private func handshakeLedger(_ project: StoryProject) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .bottom) {
                SectionHeading(eyebrow: "Safe handshake", title: "Their permission cannot be prepaid")
                Spacer(minLength: 8)
            }
            .padding(.bottom, 10)
            handshakeRow(
                "01",
                "Family Pass",
                "\(project.storyteller.familiarName) responds for themselves. Interest requests a human check; it is not interview permission."
            )
            handshakeRow(
                "02",
                "Managed human verification",
                "A human speaks directly with them, verifies identity, explains the AI-assisted interview, and records yes or no."
            )
            handshakeRow(
                "03",
                "Fresh yes on the sitting",
                "Only after verified permission may a call be scheduled. AI identity and recording are disclosed again before recording."
            )
            Text("The family sponsor cannot complete either permission step.")
                .font(StoryTheme.FontBook.body(11, weight: .semibold))
                .foregroundStyle(StoryTheme.oxblood)
                .padding(.top, 12)
        }
    }

    private func handshakeRow(_ number: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(number)
                .font(StoryTheme.FontBook.folio(9))
                .foregroundStyle(StoryTheme.emulsionAmber)
                .frame(width: 24, alignment: .leading)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(StoryTheme.FontBook.label(13))
                    .foregroundStyle(StoryTheme.ink)
                Text(detail)
                    .font(StoryTheme.FontBook.body(11))
                    .foregroundStyle(StoryTheme.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) { Divider().overlay(StoryTheme.hairline) }
    }

    private func sponsorAcknowledgment(_ project: StoryProject) -> some View {
        Button { sponsorAcknowledgedHandshake.toggle() } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: sponsorAcknowledgedHandshake ? "checkmark.square.fill" : "square")
                    .font(.system(size: 22, weight: .medium))
                    .foregroundStyle(sponsorAcknowledgedHandshake ? StoryTheme.recorderTeal : StoryTheme.mutedInk)
                VStack(alignment: .leading, spacing: 4) {
                    Text("I understand what my $5 does")
                        .font(StoryTheme.FontBook.label(13))
                        .foregroundStyle(StoryTheme.ink)
                    Text("It opens a Story Start and Family Pass. It does not grant permission or schedule an AI interview. \(project.storyteller.familiarName)'s Pass response also cannot replace the separate human verification call.")
                        .font(StoryTheme.FontBook.body(11))
                        .foregroundStyle(StoryTheme.mutedInk)
                        .multilineTextAlignment(.leading)
                }
            }
            .paperCard(tone: StoryTheme.paperBright.opacity(0.82))
        }
        .buttonStyle(.plain)
    }

    private func sittingStatusView(_ project: StoryProject) -> some View {
        guard let call = project.latestCall else { return AnyView(EmptyView()) }
        let step = project.sponsorStep

        return AnyView(
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 9) {
                        Eyebrow(text: "Sitting \(call.sequence) · \(step.position)", color: step.color)
                        Text(step.title)
                            .font(StoryTheme.FontBook.display(37, weight: .medium))
                            .tracking(-1)
                            .foregroundStyle(StoryTheme.ink)
                        Text(step.detail)
                            .font(StoryTheme.FontBook.body(14))
                            .foregroundStyle(StoryTheme.mutedInk)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    if call.status == .awaitingFamilyPassResponse {
                        familyPass(project)
                    } else if call.status == .awaitingManagedHumanPermissionCheck {
                        humanCheckPending(project)
                    } else if call.status == .previewReady, let chapter = project.latestCallChapter {
                        NavigationLink {
                            ChapterView(projectID: project.id, chapterID: chapter.id)
                        } label: {
                            FilledActionLabel(
                                title: "Open the private preview",
                                detail: "$39 Voice, $79 Story, or $149 Heirloom only after preview",
                                symbol: "play.fill"
                            )
                        }
                        .buttonStyle(.plain)
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeading(eyebrow: "Complete record", title: "The one project timeline")
                        CallTimelineView(call: call)
                    }

                    ConsentPromiseCard(condensed: true)

                    Button { dismiss() } label: {
                        FilledActionLabel(title: "Back to the project", symbol: "arrow.left")
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 20)
                .padding(.bottom, 34)
            }
            .refreshable { await model.refresh() }
        )
    }

    private func familyPass(_ project: StoryProject) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack {
                Eyebrow(text: "Invitation only", color: StoryTheme.emulsionAmber)
                Spacer()
                StoryMark(compact: true)
            }
            Text("Share this with \(project.storyteller.familiarName).")
                .font(StoryTheme.FontBook.display(23))
                .foregroundStyle(StoryTheme.ink)
            Text("They use the Pass to respond for themselves. If interested, StorySitting separately arranges the managed human identity and permission check.")
                .font(StoryTheme.FontBook.body(12))
                .foregroundStyle(StoryTheme.mutedInk)
            ShareLink(item: familyPassMessage(project)) {
                FilledActionLabel(
                    title: "Share the Family Pass",
                    detail: "Message, Mail, or AirDrop",
                    symbol: "square.and.arrow.up"
                )
            }
        }
        .paperCard(tone: StoryTheme.paperBright)
    }

    private func humanCheckPending(_ project: StoryProject) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Eyebrow(text: "StorySitting's action", color: StoryTheme.emulsionAmber)
            Text("Their response was step one—not permission.")
                .font(StoryTheme.FontBook.display(22))
                .foregroundStyle(StoryTheme.ink)
            Text("A StorySitting human now speaks directly with \(project.storyteller.familiarName), on an inbound or agreed outbound call, to verify identity and record their decision. You cannot complete this step in the sponsor app.")
                .font(StoryTheme.FontBook.body(12))
                .foregroundStyle(StoryTheme.mutedInk)
        }
        .padding(.vertical, 14)
        .overlay(alignment: .top) { Divider().overlay(StoryTheme.hairline) }
        .overlay(alignment: .bottom) { Divider().overlay(StoryTheme.hairline) }
    }

    private func familyPassMessage(_ project: StoryProject) -> String {
        "Hi \(project.storyteller.familiarName)—I opened a StorySitting Family Pass because I'd love to preserve one of your stories. This is only an invitation, not permission or an interview appointment. Use the Pass to respond for yourself. If you're interested, StorySitting will separately arrange a direct conversation with a human—on a call you make or agree to receive—to verify your identity, explain the optional AI-assisted recorded interview, and ask whether you want it scheduled."
    }
}

private struct StoryStartPurchaseSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var store: StoreService
    let project: StoryProject
    let selectedQuestionIDs: [String]
    @Binding var storyStarted: Bool

    var body: some View {
        ZStack {
            EndpaperField()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Capsule().fill(StoryTheme.hairline).frame(width: 38, height: 4).frame(maxWidth: .infinity)
                    Eyebrow(text: "Story Start \(project.calls.count + 1)")
                    Text("$5 opens the next step—not the phone call.")
                        .font(StoryTheme.FontBook.display(34, weight: .medium))
                        .foregroundStyle(StoryTheme.ink)

                    VStack(alignment: .leading, spacing: 0) {
                        summaryRow("Storyteller", project.storyteller.familiarName)
                        Divider().overlay(StoryTheme.hairline)
                        summaryRow("Family questions", selectedQuestionIDs.isEmpty ? "Gentle starters" : "\(selectedQuestionIDs.count) packed")
                        Divider().overlay(StoryTheme.hairline)
                        summaryRow("Today", store.displayPrice(for: .storyStart))
                        Divider().overlay(StoryTheme.hairline)
                        summaryRow("AI interview", "Not scheduled")
                        Divider().overlay(StoryTheme.hairline)
                        summaryRow("Later", "Private preview → optional $39 / $79 / $149 edition")
                    }
                    .paperCard(tone: StoryTheme.paperBright.opacity(0.9))

                    VStack(alignment: .leading, spacing: 11) {
                        confirmationLine("The Family Pass lets them respond for themselves.")
                        confirmationLine("A separate managed human call verifies identity and permission.")
                        confirmationLine("Only verified permission can allow scheduling.")
                        confirmationLine("AI and recording still require a fresh yes on the sitting.")
                    }

                    Button {
                        Task {
                            guard let intent = await model.createPurchaseIntent(
                                PurchaseIntentRequest(
                                    purchase: .storyStart,
                                    projectID: project.id,
                                    selectedQuestionIDs: selectedQuestionIDs,
                                    sponsorAcknowledgedHandshake: true
                                )
                            ) else { return }
                            guard let proof = await store.purchase(.storyStart, intent: intent) else { return }
                            if await model.fulfillPurchase(proof) {
                                await store.finish(transactionID: proof.transactionID)
                                storyStarted = true
                                dismiss()
                            }
                        }
                    } label: {
                        FilledActionLabel(
                            title: store.purchasing == .storyStart
                                ? "Finishing purchase…"
                                : "Pay \(store.displayPrice(for: .storyStart)) & create Family Pass",
                            detail: "One-time Story Start · no interview permission",
                            symbol: "checkmark"
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(store.purchasing != nil)

                    Text("No subscription. No automatic next call. No edition charge before a private result preview.")
                        .font(StoryTheme.FontBook.body(10, weight: .semibold))
                        .foregroundStyle(StoryTheme.mutedInk)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                }
                .padding(20)
            }
        }
        .alert("App Store", isPresented: storeErrorBinding) {
            Button("Okay", role: .cancel) { store.lastError = nil }
        } message: { Text(store.lastError ?? "") }
    }

    private func confirmationLine(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: "checkmark")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(StoryTheme.recorderTeal)
                .padding(.top, 3)
            Text(text)
                .font(StoryTheme.FontBook.body(12, weight: .medium))
                .foregroundStyle(StoryTheme.ink)
        }
    }

    private func summaryRow(_ key: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(key).foregroundStyle(StoryTheme.mutedInk)
            Spacer()
            Text(value)
                .foregroundStyle(StoryTheme.ink)
                .multilineTextAlignment(.trailing)
        }
        .font(StoryTheme.FontBook.body(12, weight: .semibold))
        .padding(.vertical, 11)
    }

    private var storeErrorBinding: Binding<Bool> {
        Binding(get: { store.lastError != nil }, set: { if !$0 { store.lastError = nil } })
    }
}
