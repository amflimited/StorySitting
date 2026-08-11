import SwiftUI

/// A warm, voice-first native palette. The product should feel closer to Photos,
/// Voice Memos, and a calm family group chat than to a printed brochure.
enum StoryTheme {
    static let endpaper = Color(hex: 0xF5F3EE)
    static let paper = Color(hex: 0xEEEAE2)
    static let paperBright = Color(hex: 0xFFFEFB)
    static let recorderTeal = Color(hex: 0x176862)
    static let recorderDark = Color(hex: 0x103F3C)
    static let emulsionAmber = Color(hex: 0xE26858)
    static let amberWash = Color(hex: 0xF5DCD4)
    static let ink = Color(hex: 0x18201F)
    static let mutedInk = Color(hex: 0x66716F)
    static let hairline = Color(hex: 0xD9D7D0)
    static let oxblood = Color(hex: 0xA83E3E)
    static let sage = Color(hex: 0xBFD8D2)
    static let butter = Color(hex: 0xF4C96B)
    static let sky = Color(hex: 0xCFE3EA)

    enum FontBook {
        static func display(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
            .system(size: size, weight: weight, design: .rounded)
        }

        static func editorial(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
            .system(size: size, weight: weight, design: .rounded)
        }

        static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
            .system(size: size, weight: weight, design: .default)
        }

        static func label(_ size: CGFloat) -> Font {
            .system(size: size, weight: .semibold, design: .rounded)
        }

        static func folio(_ size: CGFloat) -> Font {
            .system(size: size, weight: .bold, design: .rounded)
        }
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

struct EndpaperField: View {
    var body: some View {
        LinearGradient(
            colors: [StoryTheme.paperBright, StoryTheme.endpaper],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }
}

private struct PaperCardModifier: ViewModifier {
    var padding: CGFloat
    var tone: Color

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(tone, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(StoryTheme.hairline.opacity(0.72), lineWidth: 0.7)
            }
            .shadow(color: StoryTheme.ink.opacity(0.055), radius: 16, x: 0, y: 8)
    }
}

extension View {
    func paperCard(padding: CGFloat = 18, tone: Color = StoryTheme.paper) -> some View {
        modifier(PaperCardModifier(padding: padding, tone: tone))
    }
}
