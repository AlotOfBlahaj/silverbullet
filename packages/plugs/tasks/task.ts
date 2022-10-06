import type { ClickEvent, IndexTreeEvent } from "$sb/web/app_event.ts";

import {
  batchSet,
  queryPrefix,
} from "$sb/plugos-silverbullet-syscall/index.ts";
import { readPage, writePage } from "$sb/plugos-silverbullet-syscall/space.ts";
import { parseMarkdown } from "$sb/plugos-silverbullet-syscall/markdown.ts";
import {
  dispatch,
  filterBox,
  getCursor,
  getText,
} from "$sb/plugos-silverbullet-syscall/editor.ts";
import {
  addParentPointers,
  collectNodesMatching,
  collectNodesOfType,
  findNodeOfType,
  nodeAtPos,
  ParseTree,
  renderToText,
  replaceNodesMatching,
} from "$sb/common/tree.ts";
import { removeQueries } from "../query/util.ts";
import { applyQuery, QueryProviderEvent } from "../query/engine.ts";
import { niceDate } from "../core/dates.ts";

export type Task = {
  name: string;
  done: boolean;
  deadline?: string;
  tags?: string[];
  nested?: string;
  // Not saved in DB, just added when pulled out (from key)
  pos?: number;
  page?: string;
};

function getDeadline(deadlineNode: ParseTree): string {
  return deadlineNode.children![0].text!.replace(/📅\s*/, "");
}

export async function indexTasks({ name, tree }: IndexTreeEvent) {
  // console.log("Indexing tasks");
  let tasks: { key: string; value: Task }[] = [];
  removeQueries(tree);
  collectNodesOfType(tree, "Task").forEach((n) => {
    let complete = n.children![0].children![0].text! !== "[ ]";
    let task: Task = {
      name: "",
      done: complete,
    };

    replaceNodesMatching(n, (tree) => {
      if (tree.type === "DeadlineDate") {
        task.deadline = getDeadline(tree);
        // Remove this node from the tree
        return null;
      }
      if (tree.type === "Hashtag") {
        if (!task.tags) {
          task.tags = [];
        }
        task.tags.push(tree.children![0].text!);
        // Remove this node from the tree
        return null;
      }
    });

    task.name = n.children!.slice(1).map(renderToText).join("").trim();

    let taskIndex = n.parent!.children!.indexOf(n);
    let nestedItems = n.parent!.children!.slice(taskIndex + 1);
    if (nestedItems.length > 0) {
      task.nested = nestedItems.map(renderToText).join("").trim();
    }
    tasks.push({
      key: `task:${n.from}`,
      value: task,
    });
    // console.log("Task", task);
  });

  console.log("Found", tasks.length, "task(s)");
  await batchSet(name, tasks);
}

export async function taskToggle(event: ClickEvent) {
  return taskToggleAtPos(event.pos);
}

async function toggleTaskMarker(node: ParseTree, moveToPos: number) {
  let changeTo = "[x]";
  if (node.children![0].text === "[x]" || node.children![0].text === "[X]") {
    changeTo = "[ ]";
  }
  await dispatch({
    changes: {
      from: node.from,
      to: node.to,
      insert: changeTo,
    },
    selection: {
      anchor: moveToPos,
    },
  });

  let parentWikiLinks = collectNodesMatching(
    node.parent!,
    (n) => n.type === "WikiLinkPage",
  );
  for (let wikiLink of parentWikiLinks) {
    let ref = wikiLink.children![0].text!;
    if (ref.includes("@")) {
      let [page, pos] = ref.split("@");
      let text = (await readPage(page)).text;

      let referenceMdTree = await parseMarkdown(text);
      // Adding +1 to immediately hit the task marker
      let taskMarkerNode = nodeAtPos(referenceMdTree, +pos + 1);

      if (!taskMarkerNode || taskMarkerNode.type !== "TaskMarker") {
        console.error(
          "Reference not a task marker, out of date?",
          taskMarkerNode,
        );
        return;
      }
      taskMarkerNode.children![0].text = changeTo;
      text = renderToText(referenceMdTree);
      console.log("Updated reference paged text", text);
      await writePage(page, text);
    }
  }
}

export async function taskToggleAtPos(pos: number) {
  let text = await getText();
  let mdTree = await parseMarkdown(text);
  addParentPointers(mdTree);

  let node = nodeAtPos(mdTree, pos);
  if (node && node.type === "TaskMarker") {
    await toggleTaskMarker(node, pos);
  }
}

export async function taskToggleCommand() {
  let text = await getText();
  let pos = await getCursor();
  let tree = await parseMarkdown(text);
  addParentPointers(tree);

  let node = nodeAtPos(tree, pos);
  // We kwow node.type === Task (due to the task context)
  let taskMarker = findNodeOfType(node!, "TaskMarker");
  await toggleTaskMarker(taskMarker!, pos);
}

export async function postponeCommand() {
  let text = await getText();
  let pos = await getCursor();
  let tree = await parseMarkdown(text);
  addParentPointers(tree);

  let node = nodeAtPos(tree, pos)!;
  // We kwow node.type === DeadlineDate (due to the task context)
  let date = getDeadline(node);
  let option = await filterBox(
    "Postpone for...",
    [
      { name: "a day", orderId: 1 },
      { name: "a week", orderId: 2 },
      { name: "following Monday", orderId: 3 },
    ],
    "Select the desired time span to delay this task",
  );
  if (!option) {
    return;
  }
  let d = new Date(date);
  switch (option.name) {
    case "a day":
      d.setDate(d.getDate() + 1);
      break;
    case "a week":
      d.setDate(d.getDate() + 7);
      break;
    case "following Monday":
      d.setDate(d.getDate() + ((7 - d.getDay() + 1) % 7 || 7));
      break;
  }
  await dispatch({
    changes: {
      from: node.from,
      to: node.to,
      insert: `📅 ${niceDate(d)}`,
    },
    selection: {
      anchor: pos,
    },
  });
  // await toggleTaskMarker(taskMarker!, pos);
}

export async function queryProvider({
  query,
}: QueryProviderEvent): Promise<Task[]> {
  let allTasks: Task[] = [];
  for (let { key, page, value } of await queryPrefix("task:")) {
    let [, pos] = key.split(":");
    allTasks.push({
      ...value,
      page: page,
      pos: pos,
    });
  }
  return applyQuery(query, allTasks);
}
