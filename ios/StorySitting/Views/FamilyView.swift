import Foundation
import SwiftUI
import StorySittingCore

struct FamilyView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var account: AccountSession

    var body: some View {
        ZStack {
            EndpaperField()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Your family")
                            .font(StoryTheme.FontBook.display(32, weight: .bold))
                            .tracking(-0.9)
                            .foregroundStyle(StoryTheme.ink)
                        Text("People, permissions, and purchases in one calm place.")
                            .font(StoryTheme.FontBook.body(14))
                            .foregroundStyle(StoryTheme.mutedInk)
                    }

                    organizerCard

                    Text("Storytellers")
                        .font(StoryTheme.FontBook.display(23, weight: .bold))
                        .foregroundStyle(StoryTheme.ink)
                    ForEach(model.projects) { project in
                        Button {
                            model.selectedProjectID = project.id
                            model.selectedTab = .shelf
                        } label: {
                            HStack(spacing: 13) {
                                FamilyPortrait(name: project.storyteller.name, size: 52, seed: project.accentSeed)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(project.storyteller.familiarName)
                                        .font(StoryTheme.FontBook.display(19))
                                        .foregroundStyle(StoryTheme.ink)
                                    Text("\(project.chapters.count) chapter\(project.chapters.count == 1 ? "" : "s") · phone ending \(project.storyteller.phoneLastFour)")
                                        .font(StoryTheme.FontBook.body(10, weight: .semibold))
                                        .foregroundStyle(StoryTheme.mutedInk)
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(StoryTheme.recorderTeal)
                            }
                            .paperCard(padding: 14, tone: StoryTheme.paperBright.opacity(0.82))
                        }
                        .buttonStyle(.plain)
                    }

                    promiseSummary
                    paymentSummary
                    supportSummary

                    Button {
                        Task {
                            if model.isSampleMode {
                                model.endSample()
                            } else {
                                await account.signOut()
                                model.reset()
                            }
                        }
                    } label: {
                        HStack {
                            Text(model.isSampleMode ? "Close sample family" : "Sign out of StorySitting")
                            Spacer()
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                        }
                        .font(StoryTheme.FontBook.label(12))
                        .foregroundStyle(StoryTheme.recorderTeal)
                        .padding(.vertical, 14)
                    }
                    .buttonStyle(.plain)
                    .disabled(account.isWorking)
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 16)
                .padding(.bottom, 34)
            }
        }
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(StoryTheme.endpaper.opacity(0.94), for: .navigationBar)
    }

    private var organizerCard: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(StoryTheme.recorderTeal)
                Text(model.organizer?.name.first.map { String($0) } ?? "M")
                    .font(StoryTheme.FontBook.display(22, weight: .bold))
                    .foregroundStyle(StoryTheme.paperBright)
            }
            .frame(width: 60, height: 60)
            VStack(alignment: .leading, spacing: 4) {
                Text("Family organizer")
                    .font(StoryTheme.FontBook.body(11, weight: .semibold))
                    .foregroundStyle(StoryTheme.recorderTeal)
                Text(model.organizer?.name ?? "Family organizer")
                    .font(StoryTheme.FontBook.label(17))
                    .foregroundStyle(StoryTheme.ink)
                Text("\(model.organizer?.role.label ?? "Family organizer") · purchases stay with this account")
                    .font(StoryTheme.FontBook.body(10, weight: .semibold))
                    .foregroundStyle(StoryTheme.mutedInk)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .paperCard(tone: StoryTheme.paperBright)
    }

    private var promiseSummary: some View {
        VStack(alignment: .leading, spacing: 15) {
            Text("Built around their choice")
                .font(StoryTheme.FontBook.display(22, weight: .bold))
                .foregroundStyle(StoryTheme.ink)
            promiseRow("person.crop.circle.badge.checkmark", "A human verifies permission", "A Family Pass response alone never schedules AI.")
            promiseRow("waveform.badge.mic", "Recording gets a fresh yes", "AI identity and recording are disclosed again on the sitting.")
            promiseRow("hand.raised.fill", "No means stop", "No result charge and no automatic next call.")
        }
        .paperCard(padding: 18, tone: StoryTheme.sage.opacity(0.22))
    }

    private func promiseRow(_ symbol: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(StoryTheme.recorderTeal)
                .frame(width: 34, height: 34)
                .background(StoryTheme.paperBright.opacity(0.8), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(StoryTheme.FontBook.label(14))
                    .foregroundStyle(StoryTheme.ink)
                Text(detail)
                    .font(StoryTheme.FontBook.body(11))
                    .foregroundStyle(StoryTheme.mutedInk)
            }
        }
    }

    private var paymentSummary: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Payments")
                    .font(StoryTheme.FontBook.display(22, weight: .bold))
                Spacer()
                Text("No subscription")
                    .font(StoryTheme.FontBook.label(11))
                    .foregroundStyle(StoryTheme.recorderTeal)
            }
            HStack(spacing: 8) {
                compactPrice("Start", "$5")
                compactPrice("Preview", "$0")
                compactPrice("Keep", "$39+")
            }
            Text("Voice $39 · Story $79 · Heirloom $149. Upgrade later and pay only the difference.")
                .font(StoryTheme.FontBook.body(11))
                .foregroundStyle(StoryTheme.mutedInk)
        }
        .paperCard(padding: 18, tone: StoryTheme.paperBright)
    }

    private func compactPrice(_ label: String, _ price: String) -> some View {
        VStack(spacing: 3) {
            Text(price)
                .font(StoryTheme.FontBook.display(20, weight: .bold))
                .foregroundStyle(StoryTheme.recorderDark)
            Text(label)
                .font(StoryTheme.FontBook.body(11, weight: .semibold))
                .foregroundStyle(StoryTheme.mutedInk)
        }
        .frame(maxWidth: .infinity, minHeight: 70)
        .background(StoryTheme.endpaper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var supportSummary: some View {
        VStack(spacing: 0) {
            Link(destination: URL(string: "https://storysitting.com/privacy.html")!) {
                settingsRow("lock.shield.fill", "Privacy policy")
            }
            Divider().padding(.leading, 44)
            Link(destination: URL(string: "https://storysitting.com/terms.html")!) {
                settingsRow("doc.text.fill", "Terms and pricing")
            }
            Divider().padding(.leading, 44)
            Link(destination: URL(string: "mailto:hello@storysitting.com")!) {
                settingsRow("envelope.fill", "Contact StorySitting")
            }
        }
        .paperCard(padding: 8, tone: StoryTheme.paperBright)
    }

    private func settingsRow(_ symbol: String, _ title: String) -> some View {
        HStack(spacing: 13) {
            Image(systemName: symbol)
                .foregroundStyle(StoryTheme.recorderTeal)
                .frame(width: 28)
            Text(title)
                .font(StoryTheme.FontBook.label(14))
                .foregroundStyle(StoryTheme.ink)
            Spacer()
            Image(systemName: "arrow.up.right")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(StoryTheme.mutedInk)
        }
        .padding(.horizontal, 10)
        .frame(minHeight: 50)
    }

    private var economicsCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeading(eyebrow: "Pay for the result", title: "Start, preview, then decide")
                .padding(.bottom, 10)
            economicsRow("TODAY", "$5", "Open one Story Start and Family Pass")
            economicsRow("IF THEY DECLINE", "$0", "Nothing else is charged and no interview is scheduled")
            economicsRow("AFTER AUTHORIZATION", "$0", "Receive a representative private result preview")
            economicsRow("YOUR CHOICE", "$39+", "Voice, Story, or Heirloom; upgrades charge only the difference")
            economicsRow("RECURRING", "$0", "No subscription; every next sitting requires another deliberate $5", isLast: true)
        }
        .paperCard(tone: StoryTheme.paperBright.opacity(0.84))
    }

    private func economicsRow(_ moment: String, _ price: String, _ detail: String, isLast: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(moment)
                .font(StoryTheme.FontBook.folio(8))
                .foregroundStyle(StoryTheme.mutedInk)
                .frame(width: 84, alignment: .leading)
            Text(price)
                .font(StoryTheme.FontBook.display(19))
                .foregroundStyle(StoryTheme.recorderTeal)
                .frame(width: 46, alignment: .leading)
            Text(detail)
                .font(StoryTheme.FontBook.body(10, weight: .medium))
                .foregroundStyle(StoryTheme.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 11)
        .overlay(alignment: .bottom) {
            if !isLast { Divider().overlay(StoryTheme.hairline) }
        }
    }

    private var consentCenter: some View {
        VStack(alignment: .leading, spacing: 15) {
            SectionHeading(eyebrow: "Safe handshake", title: "A response is not permission")
            consentGate(
                "01",
                "Family Pass response",
                "Your loved one responds for themselves. A yes here only requests the next step; it does not schedule an AI interview."
            )
            consentGate(
                "02",
                "Managed human permission check",
                "A human speaks directly with them—on a call they make or agree to receive—verifies identity, explains the AI interview, and records their decision."
            )
            consentGate(
                "03",
                "AI + recording reconfirmed",
                "If they granted permission to schedule, the interview still begins with a fresh disclosure and a new yes before recording."
            )
            Text("“\(InterviewConsentRecord.requiredDisclosure)”")
                .font(StoryTheme.FontBook.editorial(16))
                .foregroundStyle(StoryTheme.ink)
                .lineSpacing(4)
            Divider().overlay(StoryTheme.hairline)
            consentRule("No surprise AI outreach", "An AI interview cannot be scheduled before the managed human identity and permission check is complete.")
            consentRule("Choice stays theirs", "They can decline on the Family Pass, during the human check, or at the interview—and can stop at any moment.")
        }
        .paperCard(tone: StoryTheme.amberWash.opacity(0.22))
    }

    private func consentRule(_ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "checkmark.shield.fill")
                .foregroundStyle(StoryTheme.recorderTeal)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(StoryTheme.FontBook.label(12))
                    .foregroundStyle(StoryTheme.ink)
                Text(detail)
                    .font(StoryTheme.FontBook.body(10))
                    .foregroundStyle(StoryTheme.mutedInk)
            }
        }
    }

    private func consentGate(_ number: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(number)
                .font(StoryTheme.FontBook.folio(10))
                .foregroundStyle(StoryTheme.paperBright)
                .frame(width: 31, height: 31)
                .background(StoryTheme.recorderTeal, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(StoryTheme.FontBook.label(13))
                    .foregroundStyle(StoryTheme.ink)
                Text(detail)
                    .font(StoryTheme.FontBook.body(10))
                    .foregroundStyle(StoryTheme.mutedInk)
            }
        }
    }

    private var privacyCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "lock.shield.fill")
                    .foregroundStyle(StoryTheme.recorderTeal)
                Text("Private by default")
                    .font(StoryTheme.FontBook.display(20))
                    .foregroundStyle(StoryTheme.ink)
            }
            Text("Family recordings and chapters belong in the family—not in a public feed, an ad profile, or a training set.")
                .font(StoryTheme.FontBook.body(12))
                .foregroundStyle(StoryTheme.mutedInk)
        }
        .paperCard(tone: StoryTheme.sage.opacity(0.18))
    }
}
