import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

/**
 * Quartz 4 Configuration
 *
 * See https://quartz.jzhao.xyz/configuration for more information.
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "NaHida Wiki",
    pageTitleSuffix: " | NaHida Wiki",
    enableSPA: true,
    enablePopovers: true,
    analytics: {
      provider: "plausible",
    },
    locale: "it-IT",
    baseUrl: "quartz.jzhao.xyz",
    ignorePatterns: ["private", "templates", ".obsidian", "Template"],
    defaultDateType: "modified",
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: "Balsamiq Sans",
        body: "Balsamiq Sans",
        code: "IBM Plex Mono",
      },
      colors: {
        lightMode: {
          light: "#F5F0E8", // --color-base-100 (Sfondo principale)
          lightgray: "#EAE2D5", // --color-base-200 (Bordi dei blocchi di codice, griglie)
          gray: "#DDD3C0", // --color-base-300 (Grafi, divisori pesanti)
          darkgray: "#4A3728", // --color-neutral (Testo del corpo/secondario)
          dark: "#1A1410", // --color-base-content (Titoli e testo principale)
          secondary: "#5A7A3A", // --color-primary (Link, titoli dei nodi, colore principale)
          tertiary: "#9EBB5C", // --color-accent (Stato hover dei link, nodi del grafo)
          highlight: "rgba(90, 122, 58, 0.12)", // --color-primary con opacità (sfondo righe codice/ricerca)
          textHighlight: "rgba(158, 187, 92, 0.4)", // --color-accent con opacità (evidenziatore di testo ==mark==)
        },
        darkMode: {
          light: "#1C1810", // --color-base-100 (Sfondo scuro principale)
          lightgray: "#261F14", // --color-base-200 (Bordi e linee)
          gray: "#32281A", // --color-base-300 (Grafi e separatori)
          darkgray: "#C8B89A", // --color-neutral (Testo del corpo)
          dark: "#E8DFD0", // --color-base-content (Titoli e testo ad alto contrasto)
          secondary: "#7AAA4A", // --color-primary (Link e interazioni principali)
          tertiary: "#C4DC88", // --color-accent (Hover e nodi attivi)
          highlight: "rgba(122, 170, 74, 0.15)", // --color-primary con opacità
          textHighlight: "rgba(196, 220, 136, 0.3)", // --color-accent con opacità
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "git", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "github-light",
          dark: "github-dark",
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
      // Comment out CustomOgImages to speed up build time
      Plugin.CustomOgImages(),
    ],
  },
}

export default config
