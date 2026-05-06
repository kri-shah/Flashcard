import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project URL: https://kri-shah.github.io/Flashcard/
// https://github.com/kri-shah/Flashcard
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/Flashcard/' : '/',
  plugins: [react()],
}))
