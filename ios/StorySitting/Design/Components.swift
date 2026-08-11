import Foundation
import SwiftUI
import StorySittingCore

struct StoryMark: View {
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 0 : 3) {
            Text("STORYSITTING")
                .font(StoryTheme.FontBook.display(compact ? 18 : 23, weight: .semibold))
                .tracking(-0.5)
                .foregroundStyle(StoryTheme.ink)
            if !compact {
                Rectangle()
                    .fill(StoryTheme.emulsionAmber)
                    .frame(width: 31, height: 2)
                Text("PRIVATE FAMILY ORAL HISTORY")
                    .font(StoryTheme.FontBook.folio(7))
                    .tracking(1.25)
                    .foregroundStyle(StoryTheme.mutedInk)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("StorySitting")
    }
}

struct Eyebrow: View {
    let text: String
    var color = StoryTheme.recorderTeal

    var body: some View {
        Text(text.uppercased())
            .font(StoryTheme.FontBook.folio(10))
            .tracking(1.5)
            .foregroundStyle(color)
    }
}

struct SectionHeading: View {
    let eyebrow: String
    let title: String
    var trailing: String?

    var body: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 5) {
                Eyebrow(text: eyebrow)
                Text(title)
                    .font(StoryTheme.FontBook.display(27))
                    .foregroundStyle(StoryTheme.ink)
            }
            Spacer()
            if let trailing {
                Text(trailing)
                    .font(StoryTheme.FontBook.folio(11))
                    .foregroundStyle(StoryTheme.mutedInk)
            }
        }
    }
}

struct FamilyPortrait: View {
    let name: String
    var size: CGFloat = 60
    var seed = 0

    var body: some View {
        ZStack {
            Rectangle()
                .fill(seed.isMultiple(of: 2) ? StoryTheme.amberWash : StoryTheme.sage.opacity(0.55))
            Text(initials)
                .font(StoryTheme.FontBook.display(size * 0.34))
                .foregroundStyle(StoryTheme.recorderDark)
        }
        .frame(width: size, height: size)
        .overlay(Rectangle().stroke(StoryTheme.hairline, lineWidth: 0.8))
        .accessibilityLabel(name)
    }

    private var initials: String {
        let words = name.split(separator: " ")
        return words.prefix(2).compactMap(\.first).map { String($0) }.joined()
    }
}

/// Used only where audio is actually playable. Static status surfaces use plain
/// type and rules instead of pretending to be media controls.
struct WaveformView: View {
    var progress: Double
    var active = StoryTheme.recorderTeal
    var inactive = StoryTheme.hairline

    private let bars: [CGFloat] = [
        0.24, 0.42, 0.72, 0.38, 0.88, 0.52, 0.32, 0.66, 0.95, 0.48,
        0.76, 0.34, 0.56, 0.86, 0.45, 0.29, 0.63, 0.92, 0.58, 0.38,
        0.8, 0.5, 0.3, 0.7, 0.96, 0.58, 0.42, 0.77, 0.52, 0.26
    ]

    var body: some View {
        GeometryReader { geometry in
            let played = Int(Double(bars.count) * min(max(progress, 0), 1))
            HStack(alignment: .center, spacing: 2.5) {
                ForEach(Array(bars.enumerated()), id: \.offset) { index, height in
                    Capsule()
                        .fill(index < played ? active : inactive)
                        .frame(height: max(4, geometry.size.height * height))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .accessibilityHidden(true)
    }
}

struct StatusLozenge: View {
    let text: String
    var color = StoryTheme.recorderTeal
    var symbol: String?

    var body: some View {
        HStack(spacing: 5) {
            if let symbol { Image(systemName: symbol) }
            Text(text.uppercased())
        }
        .font(StoryTheme.FontBook.folio(9))
        .tracking(0.6)
        .foregroundStyle(color)
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(color.opacity(0.07))
        .overlay(Rectangle().stroke(color.opacity(0.45), lineWidth: 0.7))
    }
}

struct FilledActionLabel: View {
    let title: String
    var detail: String?
    var symbol = "arrow.right"

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(StoryTheme.FontBook.label(16))
                if let detail {
                    Text(detail)
                        .font(StoryTheme.FontBook.body(11, weight: .medium))
                        .opacity(0.72)
                }
            }
            Spacer()
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .bold))
        }
        .foregroundStyle(StoryTheme.paperBright)
        .padding(.horizontal, 18)
        .frame(minHeight: detail == nil ? 52 : 60)
        .background(StoryTheme.recorderDark)
    }
}

struct ConsentPromiseCard: View {
    var condensed = false

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: "checkmark.shield.fill")
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(StoryTheme.recorderTeal)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 5) {
                Text("Two yeses. Both are theirs.")
                    .font(StoryTheme.FontBook.label(14))
                    .foregroundStyle(StoryTheme.ink)
                Text(condensed
                     ? "A human first verifies identity and permission. On the sitting, AI and recording are disclosed again before a fresh yes."
                     : "A Family Pass response requests a separate, managed human call. On that inbound or agreed outbound call, StorySitting verifies your loved one's identity and records their permission. If an interview is scheduled, AI identity and recording are disclosed again; recording begins only after another clear yes.")
                    .font(StoryTheme.FontBook.body(13))
                    .foregroundStyle(StoryTheme.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .paperCard(tone: StoryTheme.paperBright.opacity(0.76))
    }
}

/// The sponsor sees one six-stage process. The domain still retains the more
/// granular consent milestones for validation and audit history.
struct CallTimelineView: View {
    let call: StoryCall
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(stages.enumerated()), id: \.element.id) { index, stage in
                HStack(alignment: .top, spacing: 12) {
                    Text(String(format: "%02d", index + 1))
                        .font(StoryTheme.FontBook.folio(9))
                        .foregroundStyle(stage.state == .current ? StoryTheme.emulsionAmber : StoryTheme.mutedInk)
                        .frame(width: 23, alignment: .leading)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(stage.title)
                            .font(StoryTheme.FontBook.label(compact ? 13 : 14))
                            .foregroundStyle(stage.state == .upcoming ? StoryTheme.mutedInk : StoryTheme.ink)
                        if !compact {
                            Text(stage.detail)
                                .font(StoryTheme.FontBook.body(12))
                                .foregroundStyle(StoryTheme.mutedInk)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer()
                    Text(stateLabel(stage.state))
                        .font(StoryTheme.FontBook.folio(8))
                        .foregroundStyle(stateColor(stage.state))
                }
                .padding(.vertical, compact ? 9 : 13)
                if index < stages.count - 1 {
                    Divider().overlay(StoryTheme.hairline)
                }
            }
        }
    }

    private struct JourneyStage: Identifiable {
        let id: String
        let title: String
        let detail: String
        let state: CallMilestone.State
    }

    private var stages: [JourneyStage] {
        let cancelled = call.status == .cancelled
        let declinedBeforeHuman = call.status == .permissionDeclined
            && call.storytellerPermission.managedHumanCheckAt == nil
        let permissionStopped = call.status == .permissionDeclined || cancelled
        let interviewStopped = call.status == .interviewConsentDeclined || permissionStopped
        let passAnswered = call.storytellerPermission.familyPassRespondedAt != nil
        let permissionVerified = call.storytellerPermission.allowsInterviewScheduling
        let sittingComplete = call.interviewEndedAt != nil
        let previewReady = [StoryCall.Status.previewReady, .delivered].contains(call.status)

        return [
            JourneyStage(
                id: "start",
                title: "Story Start · $5",
                detail: "One deliberate payment opened this sitting and its Family Pass.",
                state: .complete
            ),
            JourneyStage(
                id: "family-pass",
                title: declinedBeforeHuman ? "Family Pass declined" : "Family Pass response",
                detail: declinedBeforeHuman
                    ? "The invitation ended here. Nothing else was scheduled."
                    : "The storyteller responds for themselves. Interest requests a human check; it is not interview permission.",
                state: cancelled || declinedBeforeHuman ? .stopped : (passAnswered ? .complete : .current)
            ),
            JourneyStage(
                id: "human-check",
                title: call.status == .permissionDeclined && !declinedBeforeHuman
                    ? "Permission declined"
                    : "Human identity + permission check",
                detail: call.status == .permissionDeclined && !declinedBeforeHuman
                    ? "Their verified no ended the process. No AI interview was scheduled."
                    : "A human verifies identity, explains the AI-assisted interview, and records the storyteller's decision.",
                state: permissionStopped
                    ? .stopped
                    : (permissionVerified ? .complete : (passAnswered ? .current : .upcoming))
            ),
            JourneyStage(
                id: "sitting",
                title: call.status == .interviewConsentDeclined ? "Sitting declined" : "Authorized story sitting",
                detail: call.status == .interviewConsentDeclined
                    ? "They declined after the AI and recording disclosure. Nothing was recorded."
                    : "On the call, AI identity and recording are disclosed again. Recording begins only after a fresh yes.",
                state: interviewStopped
                    ? .stopped
                    : (sittingComplete
                       ? .complete
                       : ([StoryCall.Status.scheduled, .awaitingInterviewConsent, .interviewing].contains(call.status) ? .current : .upcoming))
            ),
            JourneyStage(
                id: "preview",
                title: "Private result preview",
                detail: "The sponsor listens and reads before deciding whether to pay anything more.",
                state: interviewStopped
                    ? .stopped
                    : (previewReady ? .complete : (call.status == .craftingPreview ? .current : .upcoming))
            ),
            JourneyStage(
                id: "keep",
                title: "Keep, correct, or continue",
                detail: call.status == .delivered
                    ? "A result edition is on the shelf. Its included files and corrections are ready; another sitting begins only with another $5 Story Start."
                    : (interviewStopped
                       ? "There is no result charge. Begin again only if the storyteller wants to."
                       : "After preview, choose $39 Voice, $79 Story, $149 Heirloom, or nothing more. There is no subscription."),
                state: interviewStopped
                    ? .stopped
                    : (call.status == .delivered ? .complete : (call.status == .previewReady ? .current : .upcoming))
            )
        ]
    }

    private func stateLabel(_ state: CallMilestone.State) -> String {
        switch state {
        case .complete: return "DONE"
        case .current: return "NOW"
        case .upcoming: return "LATER"
        case .stopped: return "STOPPED"
        }
    }

    private func stateColor(_ state: CallMilestone.State) -> Color {
        switch state {
        case .complete: return StoryTheme.recorderTeal
        case .current: return StoryTheme.emulsionAmber
        case .upcoming: return StoryTheme.mutedInk
        case .stopped: return StoryTheme.oxblood
        }
    }
}

struct PurchaseExplanation: View {
    let purchase: StoryPurchase
    let price: String

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Eyebrow(text: purchase == .storyStart ? "$5 opens one sitting" : "Optional after preview")
                    Text(purchase.title)
                        .font(StoryTheme.FontBook.display(23))
                        .foregroundStyle(StoryTheme.ink)
                }
                Spacer()
                Text(price)
                    .font(StoryTheme.FontBook.display(28))
                    .foregroundStyle(StoryTheme.recorderTeal)
            }
            Text(purchase.detail)
                .font(StoryTheme.FontBook.body(14))
                .foregroundStyle(StoryTheme.mutedInk)
            HStack(spacing: 7) {
                Image(systemName: purchase == .storyStart ? "hand.raised.fill" : "pencil.line")
                Text(purchase == .storyStart
                     ? "Story Start and a Family Pass response are not permission for an AI interview."
                     : "Pay only if it is worth keeping. One factual correction pass is included.")
            }
            .font(StoryTheme.FontBook.body(11, weight: .semibold))
            .foregroundStyle(StoryTheme.oxblood)
        }
        .paperCard(tone: StoryTheme.paperBright)
    }
}

enum SponsorActionKind: Equatable {
    case start
    case familyPass
    case waiting
    case preview
    case kept
    case stopped
}

struct SponsorStepCopy {
    let kind: SponsorActionKind
    let position: String
    let title: String
    let detail: String
    let actionTitle: String
    let color: Color
}

extension StoryProject {
    var sponsorStep: SponsorStepCopy {
        guard let call = latestCall else {
            return SponsorStepCopy(
                kind: .start,
                position: "STEP 1 OF 6",
                title: "Ready for a Story Start",
                detail: "$5 opens one sitting and a Family Pass. No interview is scheduled.",
                actionTitle: "Begin Story Start · $5",
                color: StoryTheme.recorderTeal
            )
        }

        switch call.status {
        case .awaitingFamilyPassResponse:
            return SponsorStepCopy(
                kind: .familyPass,
                position: "STEP 2 OF 6",
                title: "Share the Family Pass",
                detail: "\(storyteller.familiarName) responds for themselves. Their response is not interview permission.",
                actionTitle: "Open Family Pass",
                color: StoryTheme.emulsionAmber
            )
        case .awaitingManagedHumanPermissionCheck:
            return SponsorStepCopy(
                kind: .waiting,
                position: "STEP 3 OF 6",
                title: "The human check is next",
                detail: "No action is required from you. StorySitting must verify identity and permission directly with \(storyteller.familiarName).",
                actionTitle: "Review safe-handshake status",
                color: StoryTheme.emulsionAmber
            )
        case .scheduled:
            let schedule = call.scheduledFor?.formatted(date: .abbreviated, time: .shortened) ?? "after permission"
            return SponsorStepCopy(
                kind: .waiting,
                position: "STEP 4 OF 6",
                title: "The authorized sitting is scheduled",
                detail: "Scheduled for \(schedule). AI identity and recording still require a fresh yes on the call.",
                actionTitle: "Review sitting status",
                color: StoryTheme.recorderTeal
            )
        case .awaitingInterviewConsent, .interviewing:
            return SponsorStepCopy(
                kind: .waiting,
                position: "STEP 4 OF 6",
                title: "The sitting is in progress",
                detail: "\(storyteller.familiarName) controls whether recording begins and can stop at any time.",
                actionTitle: "Review sitting status",
                color: StoryTheme.recorderTeal
            )
        case .craftingPreview:
            return SponsorStepCopy(
                kind: .waiting,
                position: "STEP 5 OF 6",
                title: "We are preparing the private preview",
                detail: "There is nothing more to pay yet. You will listen and read before deciding.",
                actionTitle: "Review production status",
                color: StoryTheme.recorderTeal
            )
        case .previewReady:
            return SponsorStepCopy(
                kind: .preview,
                position: "STEP 5 OF 6",
                title: "Preview before you pay again",
                detail: "Listen and read first. Then choose Voice, Story, Heirloom, or nothing more.",
                actionTitle: "Open private preview",
                color: StoryTheme.emulsionAmber
            )
        case .delivered:
            return SponsorStepCopy(
                kind: .kept,
                position: "STEP 6 OF 6",
                title: "The result is kept",
                detail: "The full recording and chapter are on the shelf. One factual correction pass is included.",
                actionTitle: "Open kept result",
                color: StoryTheme.recorderTeal
            )
        case .permissionDeclined:
            return SponsorStepCopy(
                kind: .stopped,
                position: "PROCESS ENDED",
                title: "Their choice was respected",
                detail: "No AI interview was scheduled. Begin another Story Start only if they ask to try again.",
                actionTitle: "Review this sitting",
                color: StoryTheme.oxblood
            )
        case .interviewConsentDeclined:
            return SponsorStepCopy(
                kind: .stopped,
                position: "PROCESS ENDED",
                title: "The call stopped before recording",
                detail: "Their no ended the sitting. There is no result-edition charge.",
                actionTitle: "Review this sitting",
                color: StoryTheme.oxblood
            )
        case .cancelled:
            return SponsorStepCopy(
                kind: .stopped,
                position: "PROCESS ENDED",
                title: "This sitting was cancelled",
                detail: "Nothing further happens automatically. Start again only when the family is ready.",
                actionTitle: "Review this sitting",
                color: StoryTheme.oxblood
            )
        }
    }

    var latestCallChapter: StoryChapter? {
        guard let chapterID = latestCall?.chapterID else { return nil }
        return chapters.first(where: { $0.id == chapterID })
    }

    var canBeginAnotherSitting: Bool {
        guard let call = latestCall else { return true }
        return [StoryCall.Status.delivered, .permissionDeclined, .interviewConsentDeclined, .cancelled].contains(call.status)
    }
}
