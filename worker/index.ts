import { handleGitHubOAuthCallback, handleGitHubOAuthStart, handleLogout, handleRefresh, requireAuth } from './auth'
import {
  handleCreateGearFromUrl,
  handleDeleteGearItem,
  handleListGearItems,
  handlePreview,
  handleRenameGearCategory,
  handleReorderGearItems,
  handleTranslateGearDescription,
  handleUpdateGearItem,
} from './gear'
import type { Env } from './types'
import { appendCorsHeaders, errorResponse, preflightResponse } from './utils'

function isApiRequest(pathname: string) {
  return pathname.startsWith('/api/')
}

async function routeApi(request: Request, env: Env) {
  const url = new URL(request.url)
  const pathname = url.pathname
  const method = request.method.toUpperCase()

  if (method === 'OPTIONS') {
    return preflightResponse(request, env)
  }

  if (method === 'GET' && pathname === '/api/auth/github/start') {
    return handleGitHubOAuthStart(request, env)
  }

  if (method === 'GET' && pathname === '/api/auth/github/callback') {
    return handleGitHubOAuthCallback(request, env)
  }

  if (method === 'POST' && pathname === '/api/auth/refresh') {
    return handleRefresh(request, env)
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    return handleLogout(request, env)
  }

  if (method === 'GET' && pathname === '/api/preview') {
    return handlePreview(request)
  }

  if (method === 'GET' && pathname === '/api/gear-items') {
    return handleListGearItems(env)
  }

  if (method === 'POST' && pathname === '/api/admin/gear-items/from-url') {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleCreateGearFromUrl(request, env)
  }

  if (method === 'POST' && pathname === '/api/admin/gear-items/translate-description') {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleTranslateGearDescription(request, env)
  }

  if (method === 'PATCH' && pathname === '/api/admin/gear-items/reorder') {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleReorderGearItems(request, env)
  }

  if (method === 'PATCH' && pathname === '/api/admin/gear-categories/rename') {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleRenameGearCategory(request, env)
  }

  if (method === 'PATCH' && pathname.startsWith('/api/admin/gear-items/') && pathname !== '/api/admin/gear-items/reorder') {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleUpdateGearItem(request, env)
  }

  if (method === 'DELETE' && pathname.startsWith('/api/admin/gear-items/')) {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleDeleteGearItem(request, env)
  }

  return errorResponse('APIが見つかりません', 404)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (isApiRequest(url.pathname)) {
      const response = await routeApi(request, env)
      return appendCorsHeaders(response, request, env)
    }

    return env.ASSETS.fetch(request)
  },
}
