import { v7 as uuidv7 } from 'uuid'
import { nanoid } from 'nanoid'

export const newId = () => uuidv7()
export const newRequestId = () => nanoid(10)
