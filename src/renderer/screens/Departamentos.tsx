import { useEffect, useState } from 'react'
import { api } from '../ipc-client'
import type { Department } from '../../shared/ipc-types'

/**
 * Pantalla de Departamentos (tasks.md 4.7, Admin only -- el guard real vive
 * en el main process via `assertRole`; aqui solo se decide si se MUESTRA la
 * pantalla, ver App.tsx). CRUD + mensaje de borrado bloqueado listando los
 * productos que lo impiden (catalog-management/spec.md).
 */
function Departamentos(): React.JSX.Element {
  const [departments, setDepartments] = useState<Department[]>([])
  const [newName, setNewName] = useState('')
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)

  async function reload(): Promise<void> {
    setDepartments(await api.catalog.listDepartments())
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleCreate(): Promise<void> {
    if (!newName.trim()) return
    await api.catalog.createDepartment({ name: newName.trim() })
    setNewName('')
    await reload()
  }

  async function handleRename(department: Department): Promise<void> {
    const name = window.prompt('Nuevo nombre del departamento', department.name)
    if (!name || !name.trim()) return
    await api.catalog.updateDepartment(department.id, { name: name.trim() })
    await reload()
  }

  async function handleDelete(department: Department): Promise<void> {
    setBlockedMessage(null)
    const result = await api.catalog.deleteDepartment(department.id)

    if (!result.deleted) {
      const names = result.blockedByProducts.map((p) => p.name).join(', ')
      setBlockedMessage(
        `No se puede eliminar "${department.name}": tiene productos asignados (${names}). Reasigna esos productos antes de reintentar.`
      )
      return
    }

    await reload()
  }

  return (
    <section>
      <h2>Departamentos</h2>
      {blockedMessage && <p role="alert">{blockedMessage}</p>}
      <ul>
        {departments.map((department) => (
          <li key={department.id}>
            {department.name}
            <button type="button" onClick={() => handleRename(department)}>
              Editar
            </button>
            <button type="button" onClick={() => handleDelete(department)}>
              Eliminar
            </button>
          </li>
        ))}
      </ul>
      <input
        value={newName}
        onChange={(event) => setNewName(event.target.value)}
        placeholder="Nombre del nuevo departamento"
      />
      <button type="button" onClick={handleCreate}>
        Agregar departamento
      </button>
    </section>
  )
}

export default Departamentos
