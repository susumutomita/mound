// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MoundMenuBar",
    defaultLocalization: "ja",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .executable(name: "MoundMenuBar", targets: ["MoundMenuBar"]),
    ],
    targets: [
        .executableTarget(
            name: "MoundMenuBar",
            path: "Sources/MoundMenuBar"
        ),
        .testTarget(
            name: "MoundMenuBarTests",
            dependencies: ["MoundMenuBar"],
            path: "Tests/MoundMenuBarTests"
        ),
    ]
)
