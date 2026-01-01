import { v4 as uuidv4 } from 'uuid'
import { ChatError, ErrorCode } from '~utils/errors'

export async function fetchConversationId(): Promise<string> {
  let resp: Response
  try {
    resp = await fetch('https://agent.minimax.io/api/chat/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: uuidv4() }),
    })
  } catch (err) {
    console.error(err)
    throw new ChatError('MiniMax webapp not available in your country', ErrorCode.MINIMAX_WEB_UNAVAILABLE)
  }

  if (resp.status === 401 || resp.status === 403) {
    throw new ChatError('There is no logged-in MiniMax account in this browser.', ErrorCode.MINIMAX_WEB_UNAUTHORIZED)
  }

  const data = await resp.json()
  return data.id
}

export async function checkConversationExists(conversationId: string): Promise<boolean> {
  try {
    const resp = await fetch(`https://agent.minimax.io/api/chat/conversations/${conversationId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    return resp.ok
  } catch {
    return false
  }
}
