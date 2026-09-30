import { useEffect, useState } from 'react'

/**
 * False on the first render, true from the frame after it. Lets a screen draw what is above the
 * fold first and add what is below it a frame later, where nobody can see it arrive.
 */
export const useFirstFrameDone = (): boolean => {
  const [done, setDone] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setDone(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return done
}
