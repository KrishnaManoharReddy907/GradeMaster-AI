/**
 * Self-hosted Monaco. @monaco-editor/react fetches Monaco from a public CDN by default;
 * an exam must not depend on a third-party CDN being reachable from a campus network,
 * and bundling lets the frontend ship a strict Content-Security-Policy.
 * Only the editor core and syntax highlighting for the supported languages are included.
 */
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/languages/definitions/python/register'
import 'monaco-editor/languages/definitions/java/register'
import 'monaco-editor/languages/definitions/cpp/register'
import 'monaco-editor/languages/definitions/javascript/register'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
loader.config({ monaco })

export { default } from '@monaco-editor/react'
export { loader }
