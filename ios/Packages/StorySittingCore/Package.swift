// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "StorySittingCore",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [
        .library(name: "StorySittingCore", targets: ["StorySittingCore"])
    ],
    targets: [
        .target(name: "StorySittingCore"),
        .testTarget(name: "StorySittingCoreTests", dependencies: ["StorySittingCore"])
    ]
)
