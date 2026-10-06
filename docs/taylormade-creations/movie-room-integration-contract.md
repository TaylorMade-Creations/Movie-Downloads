# Movie Room profile image integration contract

Use this when connecting the Movie Room app to the AI profile-picture regeneration workflow.

## App event

When a user uploads or changes a profile picture, Movie Room should create a generation request JSON file or API request with:

```json
{
  "event": "profile_picture_uploaded",
  "user_profile_id": "",
  "source_image_path": "",
  "requested_style": "East Kids Shows AI-cartoon",
  "variant_count": 3,
  "script_or_style_id": "",
  "consent_confirmed": false,
  "private_review_only": true,
  "created_at": ""
}
```

## Automation output

The automation should return:

```json
{
  "event": "profile_picture_variants_ready",
  "user_profile_id": "",
  "source_image_path": "",
  "variants": [
    {
      "image_path": "",
      "variant_number": 1,
      "style": "",
      "status": "ready_for_user_review"
    },
    {
      "image_path": "",
      "variant_number": 2,
      "style": "",
      "status": "ready_for_user_review"
    },
    {
      "image_path": "",
      "variant_number": 3,
      "style": "",
      "status": "ready_for_user_review"
    }
  ],
  "selected_variant": null,
  "requires_user_selection": true,
  "notes": "",
  "created_at": ""
}
```

## Important behavior

- Default output is review-only.
- Always generate three profile-picture options.
- Show all three options to the user for review.
- Do not automatically replace the active profile picture.
- Replace the active profile picture only after the user selects one of the three generated options.
- Store originals separately from generated variants.
- Do not publish profile pictures outside Movie Room.
- For minor/child images, require consent confirmation and keep private by default.
