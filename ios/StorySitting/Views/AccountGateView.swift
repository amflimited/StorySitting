import SwiftUI

struct AccountGateView: View {
    @EnvironmentObject private var account: AccountSession
    @EnvironmentObject private var model: AppModel

    var body: some View {
        if account.isAuthenticated {
            AppShellView()
        } else {
            signIn
        }
    }

    private var signIn: some View {
        ZStack {
            EndpaperField()
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    StoryMark()
                    VStack(alignment: .leading, spacing: 10) {
                        Eyebrow(text: "Private Story Shelf")
                        Text(account.step == .email ? "Your stories,\nin one place." : "Enter the\nsix digits.")
                            .font(StoryTheme.FontBook.display(52, weight: .medium))
                            .tracking(-1.8)
                            .foregroundStyle(StoryTheme.ink)
                        Text(account.step == .email
                             ? "Use the email from your Story Start. We will send a one-time code—no password and no social login."
                             : "If that email has a paid Story Start, the code is waiting in its inbox.")
                            .font(StoryTheme.FontBook.body(15))
                            .foregroundStyle(StoryTheme.mutedInk)
                            .lineSpacing(4)
                    }

                    VStack(alignment: .leading, spacing: 18) {
                        if let error = account.errorMessage {
                            Text(error)
                                .font(StoryTheme.FontBook.body(12, weight: .semibold))
                                .foregroundStyle(StoryTheme.oxblood)
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(StoryTheme.oxblood.opacity(0.08))
                        }

                        if account.step == .email {
                            TextField("Email address", text: $account.email)
                                .textContentType(.emailAddress)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .storyAccountField()
                            Button {
                                Task { await account.requestCode() }
                            } label: {
                                accountButton("Email my sign-in code")
                            }
                            .disabled(account.isWorking || account.email.isEmpty)
                        } else {
                            TextField("Six-digit code", text: $account.code)
                                .textContentType(.oneTimeCode)
                                .keyboardType(.numberPad)
                                .storyAccountField()
                                .onChange(of: account.code) { _, value in
                                    account.code = String(value.filter(\.isNumber).prefix(6))
                                }
                            Button {
                                Task {
                                    if await account.verifyCode() { await model.refresh() }
                                }
                            } label: {
                                accountButton("Open my Story Shelf")
                            }
                            .disabled(account.isWorking || account.code.count != 6)
                            Button("Use a different email") { account.useDifferentEmail() }
                                .font(StoryTheme.FontBook.label(11))
                                .foregroundStyle(StoryTheme.recorderTeal)
                        }
                    }
                    .paperCard(padding: 22, tone: StoryTheme.paperBright)

                    Text("The storyteller never needs this app. Their permission remains separate from the sponsor account and every purchase.")
                        .font(StoryTheme.FontBook.body(11))
                        .foregroundStyle(StoryTheme.mutedInk)
                        .lineSpacing(3)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 22)
            }
        }
    }

    private func accountButton(_ title: String) -> some View {
        HStack {
            if account.isWorking { ProgressView().tint(StoryTheme.paperBright) }
            Text(title)
            Spacer()
            Image(systemName: "arrow.right")
        }
        .font(StoryTheme.FontBook.label(13))
        .foregroundStyle(StoryTheme.paperBright)
        .padding(.horizontal, 17)
        .frame(maxWidth: .infinity, minHeight: 54)
        .background(StoryTheme.recorderTeal)
    }
}

private extension View {
    func storyAccountField() -> some View {
        self
            .font(StoryTheme.FontBook.display(24))
            .foregroundStyle(StoryTheme.ink)
            .padding(.vertical, 13)
            .overlay(alignment: .bottom) {
                Rectangle().fill(StoryTheme.ink).frame(height: 1)
            }
    }
}
