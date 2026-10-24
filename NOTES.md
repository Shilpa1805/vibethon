# SousArtist Development Notes

## Unverified
- Zhang (2025), IEEE Access 13, pp. 143599-143626 (Dropped from verified citations per spec section 15).
- Putri et al. (2025), IEEE Access 13, pp. 28135-28149 (Dropped from verified citations per spec section 15).

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

## Token Economics & Metrics
- Diagnosis payload: ~180 tokens (compact JSON with skill counts + 3 measured/expected samples).
- Graded hint payload: ~120 tokens (system instructions + prompt skeleton + single skill context).
- Caching: SHA-256 hash on input payload eliminates repeat calls on identical measurements.
- Offline mode: zero tokens, deterministic fallback.
