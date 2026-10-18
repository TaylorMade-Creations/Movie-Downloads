# TXT Drop to One Video or Series of Shorts

Goal: one text document becomes either one complete video or a series of shorts, whichever is more practical for free/browser generation and smooth continuity.

## Input

Drop one `.txt` file into:

```text
%TAYLORMADE_EAST_KIDS_ROOT%\00_Incoming_Text_Drop
```

Only `.txt` files are accepted. Non-TXT files are rejected into:

```text
%TAYLORMADE_EAST_KIDS_ROOT%\00_Incoming_Text_Drop\Rejected_Non_TXT
```

## Automatic decision

The processor supports:

- `auto`: decide the best output type.
- `single_video`: force one stitched video.
- `short_series`: force multiple shorts.

In `auto` mode:

- shorter text / shorter runtime becomes one video;
- longer text / 2-minute target becomes a short series if that is more reliable;
- if free browser generation cannot reliably cover 2 minutes, the fallback is 60-second or 30-second shorts.

## Output

The system creates:

1. A master manifest.
2. Locked character/style bible.
3. Three browser-account handoff packets.
4. One browser prompt per account.
5. Assembly plan for stitching.
6. Missing-shot/cost gate if free generation is not enough.
7. Lifecycle index record for upload/live verification.

## Continuity rule

Whether it becomes one video or multiple shorts, every account receives the same locked:

- character bible;
- style bible;
- story state;
- negative prompt;
- safety rules;
- approved reference style: Shapes + Colors.

This prevents three different-looking characters or three disconnected story pieces.

## Cost rule

Route order:

1. Reuse existing clips.
2. Local preview/editing.
3. Browser Gemini/Copilot Account 1.
4. Browser Gemini/Copilot Account 2.
5. Browser Gemini/Copilot Account 3.
6. API generation only behind approval.
7. Paid polish only behind approval.
