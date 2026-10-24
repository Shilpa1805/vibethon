# SousArtist Development Notes

## Unverified
- Zhang (2025), IEEE Access 13, pp. 143599-143626 (Dropped from verified citations per spec section 15).
- Putri et al. (2025), IEEE Access 13, pp. 28135-28149 (Dropped from verified citations per spec section 15).
- TODO(human): confirm journal details from the DOI page for de Waal et al. (journal volume/pages/DOI).

## Verified Figma APIs Used
- `figma.showUI(__html__, { width: 380, height: 640 })`
- `figma.ui.postMessage` / `figma.ui.onmessage`
- `figma.currentPage`
- `figma.loadFontAsync({ family: "Inter", style: "Regular" })`
- `figma.clientStorage.getAsync` / `figma.clientStorage.setAsync`
- `figma.viewport.scrollAndZoomIntoView`
- `figma.root.children` for page listing
- `figma.setCurrentPageAsync` (dynamic-page access requirement)
- Node traversal handling `figma.mixed` for fills, typography, layout, and padding.
- `node.setPluginData(key, value)` and `node.getPluginData(key)` for persistent node metadata without name collisions (verified via `https://www.figma.com/plugin-docs/api/properties/nodes-setplugindata/` on 2026-10-25).
- Manifest `networkAccess.devAllowedDomains`: Official Figma field for specifying localhost/dev HTTP servers separate from production allowed domains (verified via `https://www.figma.com/plugin-docs/manifest/` on 2026-10-25).

## Token Economics & Metrics
- Diagnosis payload: ~180 tokens (compact JSON with skill counts + 3 measured/expected samples).
- Graded hint payload: ~120 tokens (system instructions + prompt skeleton + single skill context).
- Caching: 32-bit hash on input payload eliminates repeat calls on identical measurements.
- Offline mode: zero tokens, deterministic fallback.

## Verified Models & Provider Configuration
- Model chosen: `gemini-2.5-flash` (default, configurable via `GEMINI_MODEL` environment variable on proxy host).
- Verified page: `https://ai.google.dev/gemini-api/docs/models` (Verified: 2026-10-25).
- REST field for system instructions: `systemInstruction` with `parts: [{ text: ... }]` (verified via `https://ai.google.dev/gemini-api/docs/system-instructions`).
