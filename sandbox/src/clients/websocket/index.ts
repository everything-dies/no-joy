import { io } from 'socket.io-client'

export default () => {
  const client = io('wss://socketio-chat-h9jt.herokuapp.com', {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  })

  return client
}
