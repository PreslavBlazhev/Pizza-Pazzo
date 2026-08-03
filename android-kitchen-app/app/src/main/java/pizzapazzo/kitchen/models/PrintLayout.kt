package pizzapazzo.kitchen.models

import org.json.JSONObject

/**
 * The ticket layout the website sends with a print job — what to print, how
 * big, where. Configured by the owner in /admin/settings/print and delivered in
 * the optional `print` block of the PrintableOrder JSON.
 *
 * Every field has a default, and [fromJson] returns [DEFAULT] for a missing or
 * unreadable block, so an older website (no `print` block at all) keeps
 * printing exactly as before.
 *
 * `scale` is the honest ceiling of a thermal printer: 1–4 steps of the base
 * font in BOTH width and height (`GS ! n`). The website also stores a point
 * size per section, but that only applies to browser printing and is
 * deliberately not sent here.
 */
data class PrintLayout(
    val templateId: String = "KITCHEN",
    val name: String = "",
    val charsPerLine: Int? = null,
    val showDividers: Boolean = true,
    val feedLinesAfter: Int? = null,
    val autoCut: Boolean? = null,
    val copies: Int = 1,
    val headerText: String = "PIZZA PAZZO",
    val footerText: String = "",
    val sections: Map<String, SectionStyle> = emptyMap(),
) {
    data class SectionStyle(
        val visible: Boolean = true,
        /** 1–4; a doubled glyph is twice as wide AND twice as tall. */
        val scale: Int = 1,
        /** "left" | "center" | "right". */
        val align: String = "left",
        val bold: Boolean = false,
    )

    /** The style for a section, or a sensible default when it is unknown. */
    fun style(section: String, fallback: SectionStyle = SectionStyle()): SectionStyle =
        sections[section] ?: fallback

    /** Whether a section prints at all. Unknown sections default to visible. */
    fun visible(section: String): Boolean = sections[section]?.visible ?: true

    companion object {
        val DEFAULT = PrintLayout()

        private fun clampScale(value: Int): Int = value.coerceIn(1, 4)

        private fun readSection(json: JSONObject?): SectionStyle {
            if (json == null) return SectionStyle()
            val align = json.optString("align", "left").lowercase()
            return SectionStyle(
                visible = json.optBoolean("visible", true),
                scale = clampScale(json.optInt("scale", 1)),
                align = if (align in setOf("left", "center", "right")) align else "left",
                bold = json.optBoolean("bold", false),
            )
        }

        /**
         * Parses the `print` block. Never throws: anything malformed degrades to
         * the default layout rather than failing the print job — a receipt with
         * the built-in layout beats no receipt at all.
         */
        fun fromJson(root: JSONObject?): PrintLayout {
            if (root == null) return DEFAULT
            return try {
                val sectionsJson = root.optJSONObject("sections")
                val sections = mutableMapOf<String, SectionStyle>()
                if (sectionsJson != null) {
                    for (key in sectionsJson.keys()) {
                        sections[key] = readSection(sectionsJson.optJSONObject(key))
                    }
                }
                PrintLayout(
                    templateId = root.optString("templateId", "KITCHEN"),
                    name = root.optString("name", ""),
                    charsPerLine = root.optInt("charsPerLine", 0).takeIf { it >= 20 },
                    showDividers = root.optBoolean("showDividers", true),
                    feedLinesAfter = if (root.has("feedLinesAfter")) {
                        root.optInt("feedLinesAfter", 4).coerceIn(0, 20)
                    } else {
                        null
                    },
                    autoCut = if (root.has("autoCut")) root.optBoolean("autoCut", true) else null,
                    copies = root.optInt("copies", 1).coerceIn(1, 5),
                    headerText = root.optString("headerText", "PIZZA PAZZO"),
                    footerText = root.optString("footerText", ""),
                    sections = sections,
                )
            } catch (_: Exception) {
                DEFAULT
            }
        }
    }
}
