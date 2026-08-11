import SwiftUI

struct AccountGateView: View {
    @EnvironmentObject private var account: AccountSession
    @EnvironmentObject private var model: AppModel

    var body: some View {
        if account.isAuthenticated || model.isSampleMode {
            AppShellView()
        } else {
            signIn
        }
    }

    private var signIn: some View {
        ZStack {
            EndpaperField()
            ScrollView {
                VStack(spacing: 0) {
                    welcomeArtwork
                    signInSheet
                }
            }
            .ignoresSafeArea(edges: .top)
        }
    }

    private var welcomeArtwork: some View {
        ZStack(alignment: .bottomLeading) {
            Image("EvelynMemory")
                .resizable()
                .scaledToFill()
                .frame(height: 390)
                .clipped()
            LinearGradient(
                colors: [.black.opacity(0.18), .clear, .black.opacity(0.74)],
                startPoint: .top,
                endPoint: .bottom
            )
            VStack(alignment: .leading, spacing: 16) {
                StoryMark()
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(.ultraThinMaterial, in: Capsule())
                Text("Every family has\na voice worth keeping.")
                    .font(StoryTheme.FontBook.display(38, weight: .bold))
                    .tracking(-1.2)
                    .foregroundStyle(.white)
                    .lineSpacing(-2)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 48)
        }
    }

    private var signInSheet: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 7) {
                Text(account.step == .email ? "Open your Story Shelf" : "Check your inbox")
                    .font(StoryTheme.FontBook.display(29, weight: .bold))
                    .tracking(-0.8)
                    .foregroundStyle(StoryTheme.ink)
                Text(account.step == .email
                     ? "Use the email from your Story Start. We’ll send a one-time code—no password."
                     : "Enter the six-digit code sent to \(account.email).")
                    .font(StoryTheme.FontBook.body(14))
                    .foregroundStyle(StoryTheme.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let error = account.errorMessage {
                Label(error, systemImage: "exclamationmark.circle.fill")
                    .font(StoryTheme.FontBook.body(12, weight: .semibold))
                    .foregroundStyle(StoryTheme.oxblood)
                    .padding(13)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(StoryTheme.oxblood.opacity(0.08), in: RoundedRectangle(cornerRadius: 16))
            }

            if account.step == .email {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Email")
                        .font(StoryTheme.FontBook.label(12))
                        .foregroundStyle(StoryTheme.mutedInk)
                    TextField("you@example.com", text: $account.email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .storyAccountField()
                }
                Button { Task { await account.requestCode() } } label: {
                    accountButton("Email my code", symbol: "envelope.fill")
                }
                .disabled(account.isWorking || account.email.isEmpty)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Six-digit code")
                        .font(StoryTheme.FontBook.label(12))
                        .foregroundStyle(StoryTheme.mutedInk)
                    TextField("000000", text: $account.code)
                        .textContentType(.oneTimeCode)
                        .keyboardType(.numberPad)
                        .storyAccountField()
                        .onChange(of: account.code) { _, value in
                            account.code = String(value.filter(\.isNumber).prefix(6))
                        }
                }
                Button {
                    Task {
                        if await account.verifyCode() { await model.refresh() }
                    }
                } label: {
                    accountButton("Open my stories", symbol: "books.vertical.fill")
                }
                .disabled(account.isWorking || account.code.count != 6)
                Button("Use a different email") { account.useDifferentEmail() }
                    .font(StoryTheme.FontBook.label(13))
                    .foregroundStyle(StoryTheme.recorderTeal)
                    .frame(maxWidth: .infinity)
            }

            HStack {
                Rectangle().fill(StoryTheme.hairline).frame(height: 1)
                Text("or")
                    .font(StoryTheme.FontBook.body(12, weight: .medium))
                    .foregroundStyle(StoryTheme.mutedInk)
                Rectangle().fill(StoryTheme.hairline).frame(height: 1)
            }

            Button {
                Task { await model.beginSample() }
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 16, weight: .semibold))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Explore a sample family")
                            .font(StoryTheme.FontBook.label(15))
                        Text("See the complete app without signing in")
                            .font(StoryTheme.FontBook.body(11))
                            .opacity(0.72)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                }
                .foregroundStyle(StoryTheme.recorderDark)
                .padding(.horizontal, 17)
                .frame(minHeight: 62)
                .background(StoryTheme.sage.opacity(0.35), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)

            Label("The storyteller never needs this app. Their permission always remains separate.", systemImage: "checkmark.shield.fill")
                .font(StoryTheme.FontBook.body(11, weight: .medium))
                .foregroundStyle(StoryTheme.mutedInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 20)
        .padding(.top, 28)
        .padding(.bottom, 38)
        .background(StoryTheme.paperBright)
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 32, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 32, style: .continuous))
        .offset(y: -28)
        .padding(.bottom, -28)
    }

    private func accountButton(_ title: String, symbol: String) -> some View {
        HStack {
            if account.isWorking { ProgressView().tint(.white) }
            Text(title)
            Spacer()
            Image(systemName: symbol)
        }
        .font(StoryTheme.FontBook.label(15))
        .foregroundStyle(.white)
        .padding(.horizontal, 18)
        .frame(maxWidth: .infinity, minHeight: 56)
        .background(StoryTheme.recorderDark, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private extension View {
    func storyAccountField() -> some View {
        self
            .font(StoryTheme.FontBook.body(17, weight: .semibold))
            .foregroundStyle(StoryTheme.ink)
            .padding(.horizontal, 16)
            .frame(minHeight: 56)
            .background(StoryTheme.endpaper.opacity(0.7), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(StoryTheme.hairline, lineWidth: 0.8)
            }
    }
}
