import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/intergrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Todo } from "@/data/mock";

const PRIORITY_TO_NUMBER: Record<Todo["priority"], number> = {
  cao: 3,
  vừa: 2,
  thấp: 1,
};

const NUMBER_TO_PRIORITY: Record<number, Todo["priority"]> = {
  3: "cao",
  2: "vừa",
  1: "thấp",
};

type TodoRow = {
  id: string;
  title: string;
  category: string | null;
  priority: number | null;
  completed: boolean;
  due_at: string | null;
  user_id: string;
};

function timeToIso(time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function isoToTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function rowToTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    tag: row.category ?? "",
    priority: NUMBER_TO_PRIORITY[row.priority ?? 2] ?? "vừa",
    done: row.completed,
    time: isoToTime(row.due_at),
  };
}

/**
 * User-scoped to-do list backed by Supabase. Todos are loaded for the current
 * user and every add/toggle/remove/clear is persisted to the `todos` table.
 */
export function useTodos() {
  const { user } = useAuth();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setTodos([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("todos")
      .select("*")
      .eq("user_id", user.id)
      .order("due_at", { ascending: true, nullsFirst: false });

    if (error) {
      console.error("[useTodos] load failed:", error);
    } else if (data) {
      setTodos((data as TodoRow[]).map(rowToTodo));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(
    async (todo: Omit<Todo, "id" | "done">) => {
      if (!user) return;
      const { data, error } = await supabase
        .from("todos")
        .insert({
          title: todo.title,
          category: todo.tag,
          priority: PRIORITY_TO_NUMBER[todo.priority] ?? 2,
          completed: false,
          due_at: timeToIso(todo.time),
          user_id: user.id,
        })
        .select("*")
        .single();

      if (error) {
        console.error("[useTodos] add failed:", error);
        return;
      }
      if (data) setTodos((prev) => [...prev, rowToTodo(data as TodoRow)]);
    },
    [user],
  );

  const toggle = useCallback(
    async (id: string) => {
      const target = todos.find((t) => t.id === id);
      if (!target) return;
      const nextDone = !target.done;

      const { error } = await supabase
        .from("todos")
        .update({ completed: nextDone })
        .eq("id", id);

      if (error) {
        console.error("[useTodos] toggle failed:", error);
        return;
      }
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: nextDone } : t)));
    },
    [todos],
  );

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("todos").delete().eq("id", id);
    if (error) {
      console.error("[useTodos] remove failed:", error);
      return;
    }
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearDone = useCallback(async () => {
    const doneIds = todos.filter((t) => t.done).map((t) => t.id);
    if (doneIds.length === 0) return;

    const { error } = await supabase.from("todos").delete().in("id", doneIds);
    if (error) {
      console.error("[useTodos] clearDone failed:", error);
      return;
    }
    setTodos((prev) => prev.filter((t) => !t.done));
  }, [todos]);

  return { todos, loading, add, toggle, remove, clearDone };
}
