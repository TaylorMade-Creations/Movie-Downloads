# TXT-Only Intake and YouTube Live Completion Lifecycle

## Intake rule

The automation only accepts `.txt` files as script/source instructions.

Accepted folder:

```text
00_Incoming_Text_Drop
```

Rejected folder:

```text
00_Incoming_Text_Drop\Rejected_Non_TXT
```

If a non-TXT file appears, the automation must reject it and not convert it into video prompts.

## Processed TXT files

After a TXT is accepted and converted into generation packets, the job receives a lifecycle record in:

```text
13_Upload_Verification\Pending_Live_Check
```

The record tracks:

- job ID;
- original TXT path;
- TXT file hash;
- output mode: single video or short series;
- upload status;
- YouTube watch URL;
- live confirmation time;
- completed index path;
- front-end verification requirement.

## Upload / live confirmation

After upload through approved API/cloud automation and once the video is confirmed live, call:

```powershell
complete_youtube_live_index.ps1 -JobId "<job_id>" -YouTubeUrl "https://youtube.com/watch?v=..." -Title "..."
```

This creates:

```text
13_Upload_Verification\Completed_Live\<job_id>.lifecycle.json
13_Upload_Verification\Completed_Index\<job_id>.completed.json
13_Upload_Verification\Completed_Index\youtube-live-completed-index.jsonl
```

## Front-end requirement

The completed index must include a direct YouTube link so Kyle can personally verify every video from the completed front end.

Status after live confirmation:

```text
completed_live_needs_front_end_verification
```

Only after Kyle verifies the live video should a future front-end/app mark it:

```text
front_end_verified
```
