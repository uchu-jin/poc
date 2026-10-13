export const onRequestPost: PagesFunction = async () => {
  return new Response(JSON.stringify({ code: 'not_implemented' }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
  });
};
