import { EditorView, ViewPlugin, ViewUpdate } from "../deps.ts";
import { safeRun } from "../../plugos/util.ts";
import { maximumAttachmentSize } from "../../common/types.ts";
import { Editor } from "../editor.tsx";

// We use turndown to convert HTML to Markdown
import TurndownService from "https://cdn.skypack.dev/turndown@7.1.1";

// With tables and task notation as well
import {
  tables,
  taskListItems,
} from "https://cdn.skypack.dev/@joplin/turndown-plugin-gfm@1.0.45";
const turndownService = new TurndownService({
  hr: "---",
  codeBlockStyle: "fenced",
  headingStyle: "atx",
  emDelimiter: "*",
  bulletListMarker: "*", // Duh!
  strongDelimiter: "**",
  linkStyle: "inlined",
});
turndownService.use(taskListItems);
turndownService.use(tables);

function striptHtmlComments(s: string): string {
  return s.replace(/<!--[\s\S]*?-->/g, "");
}

const urlRegexp =
  /^https?:\/\/[-a-zA-Z0-9@:%._\+~#=]{1,256}([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;

// Known iOS Safari paste issue (unrelated to this implementation): https://voxpelli.com/2015/03/ios-safari-url-copy-paste-bug/
export const pasteLinkExtension = ViewPlugin.fromClass(
  class {
    update(update: ViewUpdate): void {
      update.transactions.forEach((tr) => {
        if (tr.isUserEvent("input.paste")) {
          const pastedText: string[] = [];
          let from = 0;
          let to = 0;
          tr.changes.iterChanges((fromA, _toA, _fromB, toB, inserted) => {
            pastedText.push(inserted.sliceString(0));
            from = fromA;
            to = toB;
          });
          const pastedString = pastedText.join("");
          if (pastedString.match(urlRegexp)) {
            const selection = update.startState.selection.main;
            if (!selection.empty) {
              setTimeout(() => {
                update.view.dispatch({
                  changes: [
                    {
                      from: from,
                      to: to,
                      insert: `[${
                        update.startState.sliceDoc(
                          selection.from,
                          selection.to,
                        )
                      }](${pastedString})`,
                    },
                  ],
                });
              });
            }
          }
        }
      });
    }
  },
);

export function attachmentExtension(editor: Editor) {
  return EditorView.domEventHandlers({
    dragover: (event) => {
      event.preventDefault();
    },
    drop: (event: DragEvent) => {
      // TODO: This doesn't take into account the target cursor position,
      // it just drops the attachment wherever the cursor was last.
      if (event.dataTransfer) {
        const payload = [...event.dataTransfer.files];
        if (!payload.length) {
          return;
        }
        safeRun(async () => {
          await processFileTransfer(payload);
        });
      }
    },
    paste: (event: ClipboardEvent) => {
      const payload = [...event.clipboardData!.items];
      const richText = event.clipboardData?.getData("text/html");
      if (richText) {
        const markdown = striptHtmlComments(turndownService.turndown(richText))
          .trim();
        const view = editor.editorView!;
        const selection = view.state.selection.main;
        console.log("Rich text", markdown);
        view.dispatch({
          changes: [
            {
              from: selection.from,
              to: selection.to,
              insert: markdown,
            },
          ],
          selection: {
            anchor: selection.from + markdown.length,
          },
          scrollIntoView: true,
        });
        return true;
      }
      if (!payload.length || payload.length === 0) {
        return false;
      }
      safeRun(async () => {
        await processItemTransfer(payload);
      });
    },
  });

  async function processFileTransfer(payload: File[]) {
    const data = await payload[0].arrayBuffer();
    await saveFile(data!, payload[0].name, payload[0].type);
  }

  async function processItemTransfer(payload: DataTransferItem[]) {
    const file = payload.find((item) => item.kind === "file");
    if (!file) {
      return false;
    }
    const fileType = file.type;
    const ext = fileType.split("/")[1];
    const fileName = new Date()
      .toISOString()
      .split(".")[0]
      .replace("T", "_")
      .replaceAll(":", "-");
    const data = await file!.getAsFile()?.arrayBuffer();
    await saveFile(data!, `${fileName}.${ext}`, fileType);
  }

  async function saveFile(
    data: ArrayBuffer,
    suggestedName: string,
    mimeType: string,
  ) {
    if (data!.byteLength > maximumAttachmentSize) {
      editor.flashNotification(
        `Attachment is too large, maximum is ${
          maximumAttachmentSize / 1024 / 1024
        }MB`,
        "error",
      );
      return;
    }

    const finalFileName = prompt(
      "File name for pasted attachment",
      suggestedName,
    );
    if (!finalFileName) {
      return;
    }
    await editor.space.writeAttachment(finalFileName, "arraybuffer", data!);
    let attachmentMarkdown = `[${finalFileName}](${finalFileName})`;
    if (mimeType.startsWith("image/")) {
      attachmentMarkdown = `![](${finalFileName})`;
    }
    editor.editorView!.dispatch({
      changes: [
        {
          insert: attachmentMarkdown,
          from: editor.editorView!.state.selection.main.from,
        },
      ],
    });
  }
}
