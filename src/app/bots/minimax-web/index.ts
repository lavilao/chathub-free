import { parseSSEResponse } from '~utils/sse'
import { AbstractBot, SendMessageParams } from '../abstract-bot'
import { checkConversationExists, fetchConversationId } from './api'
import { requestHostPermission } from '~app/utils/permissions'
import { ChatError, ErrorCode } from '~utils/errors'

interface ConversationContext {
  conversationId: string
  lastMessageId: string
}

export class MiniMaxWebBot extends AbstractBot {
  private conversationContext?: ConversationContext

  constructor() {
    super()
  }

  async doSendMessage(params: SendMessageParams): Promise<void> {
    if (!(await requestHostPermission('https://agent.minimax.io/'))) {
      throw new ChatError('Missing agent.minimax.io permission', ErrorCode.MISSING_HOST_PERMISSION)
    }

    if (!this.conversationContext) {
      // Try to create a new conversation
      this.conversationContext = {
        conversationId: await fetchConversationId(),
        lastMessageId: '',
      }
    }

    const resp = await fetch('https://agent.minimax.io/api/chat', {
      method: 'POST',
      signal: params.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversation_id: this.conversationContext.conversationId,
        parent_message_id: this.conversationContext.lastMessageId || undefined,
        prompt: params.prompt,
      }),
    })

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        // Reset conversation context for auth errors
        this.conversationContext = undefined
        throw new ChatError(
          'There is no logged-in MiniMax account in this browser.',
          ErrorCode.MINIMAX_WEB_UNAUTHORIZED,
        )
      }
      if (resp.status === 404) {
        // Conversation not found, reset and try again
        this.conversationContext = undefined
        throw new ChatError('Conversation not found. Please try again.', ErrorCode.MINIMAX_WEB_CONVERSATION_NOT_FOUND)
      }
      throw new ChatError(`MiniMax API error: ${resp.status}`, ErrorCode.UNKOWN_ERROR)
    }

    let result = ''
    let messageId = ''

    await parseSSEResponse(resp, (message) => {
      console.debug('minimax sse message', message)
      try {
        const payload = JSON.parse(message)

        if (payload.message_id) {
          messageId = payload.message_id
        }

        if (payload.choices && payload.choices[0] && payload.choices[0].delta && payload.choices[0].delta.content) {
          result += payload.choices[0].delta.content
          params.onEvent({
            type: 'UPDATE_ANSWER',
            data: { text: result.trimStart() },
          })
        } else if (payload.error) {
          throw new Error(JSON.stringify(payload.error))
        }
      } catch (err) {
        console.debug('Failed to parse SSE message:', message, err)
      }
    })

    // Update conversation context with the last message ID
    if (messageId && this.conversationContext) {
      this.conversationContext.lastMessageId = messageId
    }

    params.onEvent({ type: 'DONE' })
  }

  resetConversation() {
    this.conversationContext = undefined
  }

  get name() {
    return 'MiniMax (webapp)'
  }
}
