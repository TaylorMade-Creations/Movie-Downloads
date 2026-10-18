# East Kids Shows / Movie Room AI Character Automation

Purpose: turn user-uploaded profile images, pet photos, or approved character references into safe AI-cartoon character assets and short educational videos.

This workflow is separate from:

- Movie Room/Jellyfin library conversion;
- job applications and job-route planning;
- Kiddo Learn upload/premiere staging, unless a video is explicitly moved there.

## Main pipelines

### 1. East Kids Shows shorts pipeline

Route:

1. Intake script/topic and reference images.
2. Create character bible and prompt pack.
3. Reuse existing renders when possible.
4. Generate missing clips using browser/free accounts first.
5. Use API/paid generation only after explicit approval and cost cap.
6. Assemble/edit locally.
7. Create metadata, thumbnail prompt, and review copy.

### 2. Movie Room profile-picture regeneration pipeline

Route:

1. User changes or uploads a profile image in Movie Room.
2. App saves the original image and a generation request.
3. Automation creates one or more AI-cartoon profile variants in the selected style.
4. Output returns to Movie Room as review-only profile-picture options.
5. User chooses one. The app does not replace the profile picture automatically unless that behavior is explicitly enabled.

## Safety and consent rules

- Do not create public-facing content from a real person's face unless the uploader has rights/permission to use that image.
- For children/minors, default to private review-only output and avoid realistic identity-preserving face generation unless the user confirms consent and intended use.
- Do not store raw passwords, MFA codes, recovery codes, or passkeys in this workflow.
- Do not spend paid credits or publish/upload anything without explicit approval.

## Preferred style for kids content

- Preschool-friendly, warm, clear, simple educational language.
- Less visual clutter than previous rainbow-heavy tests.
- Expressive AI-cartoon characters based on approved uploaded images.
- Consistent recurring character traits across clips.
- Gentle humor, friendly pacing, real movement where generated video is used.

## Cheapest route order

1. Reuse already-generated free video clips and approved reference art.
2. Local editing, text overlays, voice/audio, thumbnail generation, and upscaling.
3. Browser-based Gemini/Copilot free account generation.
4. API generation through configured routes.
5. Paid polish/fixes only after cost estimate and approval.
