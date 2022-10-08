import { Hook, Manifest } from "../../plugos/types.ts";
import { System } from "../../plugos/system.ts";
import {
  Completion,
  CompletionContext,
  CompletionResult,
} from "../../dep_web.ts";
import { safeRun } from "../../common/util.ts";
import { Editor } from "../editor.tsx";
import { syntaxTree } from "../../dep_web.ts";

export type SlashCommandDef = {
  name: string;
  description?: string;
};

export type AppSlashCommand = {
  slashCommand: SlashCommandDef;
  run: () => Promise<void>;
};

export type SlashCommandHookT = {
  slashCommand?: SlashCommandDef;
};

const slashCommandRegexp = /([^\w]|^)\/[\w\-]*/;

export class SlashCommandHook implements Hook<SlashCommandHookT> {
  slashCommands = new Map<string, AppSlashCommand>();
  private editor: Editor;

  constructor(editor: Editor) {
    this.editor = editor;
  }

  buildAllCommands(system: System<SlashCommandHookT>) {
    this.slashCommands.clear();
    for (let plug of system.loadedPlugs.values()) {
      for (
        const [name, functionDef] of Object.entries(
          plug.manifest!.functions,
        )
      ) {
        if (!functionDef.slashCommand) {
          continue;
        }
        const cmd = functionDef.slashCommand;
        this.slashCommands.set(cmd.name, {
          slashCommand: cmd,
          run: () => {
            return plug.invoke(name, [cmd]);
          },
        });
      }
    }
  }

  // Completer for CodeMirror
  public slashCommandCompleter(
    ctx: CompletionContext,
  ): CompletionResult | null {
    let prefix = ctx.matchBefore(slashCommandRegexp);
    if (!prefix) {
      return null;
    }
    const prefixText = prefix.text;
    let options: Completion[] = [];

    // No slash commands in comment blocks (queries and such)
    let currentNode = syntaxTree(ctx.state).resolveInner(ctx.pos);
    if (currentNode.type.name === "CommentBlock") {
      return null;
    }
    for (let [name, def] of this.slashCommands.entries()) {
      options.push({
        label: def.slashCommand.name,
        detail: def.slashCommand.description,
        apply: () => {
          // Delete slash command part
          this.editor.editorView?.dispatch({
            changes: {
              from: prefix!.from + prefixText.indexOf("/"),
              to: ctx.pos,
              insert: "",
            },
          });
          // Replace with whatever the completion is
          safeRun(async () => {
            await def.run();
            this.editor.focus();
          });
        },
      });
    }
    return {
      // + 1 because of the '/'
      from: prefix.from + prefixText.indexOf("/") + 1,
      options: options,
    };
  }

  apply(system: System<SlashCommandHookT>): void {
    this.buildAllCommands(system);
    system.on({
      plugLoaded: () => {
        this.buildAllCommands(system);
      },
    });
  }

  validateManifest(manifest: Manifest<SlashCommandHookT>): string[] {
    let errors = [];
    for (const [name, functionDef] of Object.entries(manifest.functions)) {
      if (!functionDef.slashCommand) {
        continue;
      }
      const cmd = functionDef.slashCommand;
      if (!cmd.name) {
        errors.push(`Function ${name} has a command but no name`);
      }
    }
    return [];
  }
}
