/*
"src/components/widgets/button/content": "This is my button",
"src/components/widgets/button/fallback": "Waiting the click to resolve...",
"src/components/widgets/button/error/title": "Something didn't work",
"src/components/widgets/button/error/actions/retry": "Retry",
*/

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
