# Deskflow for Rainmeter

Describe a to-do list in Chinese or English, preview it as a desktop widget, and download a Rainmeter `.ini` skin.

Deskflow is an early, local-first project. Its template engine turns simple natural-language lists into a Rainmeter skin without an API key. AI-assisted planning is a later, optional feature; generated skins stay reviewable before you install them.

## Try it

Open `index.html` in a modern browser. Edit the example prompt, choose **生成桌面皮肤**, then try the checkboxes or download `DeskflowTodo.ini`.

To use the downloaded skin, install Rainmeter, put the `.ini` file in a new folder under your Rainmeter `Skins` directory, open **Manage Rainmeter**, select **Refresh all**, then load `DeskflowTodo.ini` from the Manage window. Left-click a task to complete it; right-click to reopen it. Progress is saved in the skin file and survives a Rainmeter refresh.

## Current scope

- Chinese and English task-list prompts
- A live, clickable preview
- Rainmeter `.ini` export
- Left-click to complete and right-click to reopen a task in Rainmeter
- Completion state and progress saved in the generated skin
- No account, server, or API key needed

The parser is deliberately simple and splits tasks on commas, semicolons, and line breaks. Review the preview and exported skin before using it. Rainmeter skins can run plugin or command actions, so only load skins you trust.

## Roadmap

- Improve task extraction and date handling
- Add themes, editable task text, and more widget layouts
- Validate generated skins against Rainmeter
- Add an optional AI provider with explicit user-controlled configuration
- Gather feedback from Rainmeter users before expanding the feature set

## Contributing

Bug reports and focused feature proposals are welcome. Please include a short prompt, the expected tasks, and the actual result. Keep API keys and private information out of issues.

## License

MIT. See [LICENSE](LICENSE).
