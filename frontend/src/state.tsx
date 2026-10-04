import { createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { accessKey, api, type Row, type Session } from "./api";
import type { FeedbackTone } from "./feedback";
export const AppContext = createContext<{
  user: Session;
  notify: (message: string, tone?: FeedbackTone) => void;
}>({ user: null!, notify: () => {} });
export const useApp = () => useContext(AppContext);
export function useData<T = Row[]>(
  path: string,
  enabled = true,
  refetchInterval?: number,
) {
  const { user } = useApp();
  return useQuery<T, Error>({
    queryKey: [path, accessKey(user)],
    queryFn: () => api<T>(path),
    enabled,
    refetchInterval,
  });
}
export function useWrite() {
  const client = useQueryClient();
  const { notify } = useApp();
  return async (
    path: string,
    method: string,
    data?: unknown,
    message = "Cambios guardados correctamente",
  ) => {
    await api(path, method, data);
    await client.invalidateQueries();
    notify(message);
  };
}
export const useLookups = () => useData<Record<string, Row[]>>("lookups");
