# Vegas-MD Bot TODO

- [x] Route anti-delete recoveries only to the owner’s personal DM and avoid sending a recovery copy back into the source chat.
- [x] Forward every supported incoming view-once image or video reply silently to the owner’s personal DM, including messages not prefixed with `.vv`.
- [x] Repair `.play` query handling, downloader selection, media conversion, and fallback error reporting.
- [x] Add regression coverage for anti-delete routing, automatic view-once forwarding, and play fallback behavior.
- [x] Run the relevant Vegas-MD tests and syntax checks before deployment.
- [x] Document PM2 restart/deployment steps for the VPS.

## History

- [ ] Previous bot changes and dashboard integration remain tracked in the dashboard project checklist.


- [x] Trace free-chat activation, owner gating, and ordinary-message routing from WhatsApp event to AI provider.
- [x] Trace `.code` and newly added command registration, dispatcher permissions, and provider fallback behavior.
- [x] Add regression coverage for free-chat, coding, and new-command execution paths.
- [x] Run the focused bot tests and syntax checks, then document VPS restart steps.

- [x] Audit both repositories before publishing and confirm secrets, sessions, database data, and local environment files remain excluded.
- [x] Commit and push the completed bot changes to the Vegas-MD `main` branch.
- [x] Commit and push the completed control-center dashboard changes to its GitHub `main` branch.
- [x] Improve image enhancement and upscaling quality with dimension-aware output validation and high-quality local fallback processing.
- [x] Add a dedicated video-enhancement command that preserves source dimensions and improves visual quality without silently reducing resolution.
- [x] Add media enhancement regression coverage, provider response validation, and deployment documentation.
- [x] Commit and push the image and video enhancement quality fixes to the Vegas-MD `main` branch.
- [x] Trace why current image/video enhancement output does not show a meaningful clarity improvement and ensure provider results cannot bypass the high-quality local path.
- [x] Permit everyone to use free-chat in direct messages and groups when the owner has explicitly enabled free-chat and group free-chat.
- [x] Add regressions for visible enhancement pipeline selection and non-owner free-chat rejection, then publish the corrective patch.
- [x] Restrict free-chat replies to messages that explicitly tag the bot and keep untagged conversations silent.
- [x] Add mention-only free-chat regression coverage, validate all bot behavior, and publish the correction.

- [x] Allow enabled free-chat to reply when a user directly replies to a bot message, while keeping unrelated untagged messages silent.
- [x] Add reply-to-bot routing regression coverage, validate the full suite, and publish the correction to GitHub main.
