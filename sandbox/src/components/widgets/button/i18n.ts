export default () => ({
  content: 'This is my button',
  fallback: 'Waiting the click to resolve...',
  error: {
    title: "Something didn't work",
    actions: {
      retry: 'Retry',
    },
  },
})
