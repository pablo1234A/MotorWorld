import { useQueryClient } from '@tanstack/react-query';

/** Tras una operación confirmada por el servidor, se refrescan todas las vistas afectadas. */
export function useRefreshQuoteData() {
  const queryClient = useQueryClient();
  return (contactId?: string) => {
    void queryClient.invalidateQueries({ queryKey: ['quotes'] });
    void queryClient.invalidateQueries({ queryKey: ['follow-ups'] });
    void queryClient.invalidateQueries({ queryKey: ['activity'] });
    void queryClient.invalidateQueries({ queryKey: ['usage'] });
    void queryClient.invalidateQueries({ queryKey: ['metrics'] });
    if (contactId) void queryClient.invalidateQueries({ queryKey: ['contacts', 'detail', contactId] });
  };
}
