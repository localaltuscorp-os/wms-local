pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "altus"

include(":app")

// The :baselineprofile macrobenchmark module joins pre-v1 (Part 6 of the design
// contract: Baseline Profile before the v1 tag). It is intentionally not included
// yet so the scaffold syncs and builds before that module's files land:
// include(":baselineprofile")
