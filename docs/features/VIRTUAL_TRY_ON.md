# Virtual Try-On

User picks a photo, types an outfit description, and gets a composited result.

## Flow

```
Photo picker → description text field → POST /generate-garment → POST /apply-garment → full-bleed result
```

1. User selects a photo (`WardrobeTryOnScreen` picker callback).
2. `WardrobeViewModel.onPhotoSelected` stores the base64 photo, resets `sessionId`, clears undo stack and stable intent.
3. User types a description and submits → `onDescriptionSubmitted`.
4. `POST /generate-garment` → NB2 Lite returns a transparent-background garment PNG.
5. `POST /apply-garment` → Omni Flash composites the garment onto the photo, returns a `sessionId`.
6. Result stored in `WardrobeUiState.Success`; previous result pushed onto undo stack (max depth 2).

## UI states

`Idle → GeneratingGarment → ApplyingGarment → Success | Error`

All transitions are in-place `AnimatedContent` swaps — no navigation flash.

## Undo

`WardrobeViewModel.undo()` pops the last `(resultImageBase64, sessionId)` pair from `undoStack` and rewinds the Omni Flash session pointer so the next edit continues from the correct history.

## Known issues

- Undo button never appears: `_uiState` is set to `ApplyingGarment` before the `Success` check that would push to `undoStack`, so the stack never fills.
- Full-resolution photos are sent as-is (~6 MB+ base64). Downscale to ≤1024 px before encoding.
- Photos are always labelled `image/jpeg` in the relay regardless of actual format.
- `onPhotoSelected` does not cancel `intentDebounceJob` — an 800 ms-pending intent from the previous photo can fire against the new one.
