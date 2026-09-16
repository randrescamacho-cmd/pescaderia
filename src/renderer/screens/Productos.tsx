import { useEffect, useState } from 'react'
import { api } from '../ipc-client'
import type { Department, Product } from '../../shared/ipc-types'

interface ProductFormState {
  name: string
  price: string
  cost: string
  departmentId: string
  barcode: string
}

const EMPTY_FORM: ProductFormState = { name: '', price: '', cost: '', departmentId: '', barcode: '' }

function toFormState(product: Product): ProductFormState {
  return {
    name: product.name,
    price: String(product.price),
    cost: product.cost === null ? '' : String(product.cost),
    departmentId: String(product.departmentId),
    barcode: product.barcode ?? ''
  }
}

/**
 * Pantalla de Productos (tasks.md 4.8, Admin only). Formulario CRUD: nombre,
 * precio, costo (opcional -- catalog-management/spec.md "Product Cost and
 * Missing-Cost Handling"), departamento (obligatorio, fijo por producto) y
 * codigo de barras (opcional).
 *
 * PR2 follow-up (verify-report-pr2.md WARNING 2): el mismo formulario de
 * "Crear" se reutiliza para "Editar" (catalog-management/spec.md "Single
 * Fixed Department per Product" > "Reasignar producto a otro departamento")
 * -- "Editar" precarga el formulario con el producto elegido; `editingId`
 * decide si el submit llama `createProduct` o `updateProduct` (backend ya
 * existia y ya estaba probado, solo faltaba la UI para invocarlo).
 */
function Productos(): React.JSX.Element {
  const [products, setProducts] = useState<Product[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reload(): Promise<void> {
    setProducts(await api.catalog.listProducts())
    setDepartments(await api.catalog.listDepartments())
  }

  useEffect(() => {
    reload()
  }, [])

  function buildInput(): {
    name: string
    price: number
    cost: number | null
    departmentId: number | null
    barcode: string | null
  } {
    return {
      name: form.name.trim(),
      price: Number(form.price),
      cost: form.cost.trim() ? Number(form.cost) : null,
      departmentId: form.departmentId ? Number(form.departmentId) : null,
      barcode: form.barcode.trim() || null
    }
  }

  async function handleSave(): Promise<void> {
    setError(null)
    try {
      if (editingId !== null) {
        await api.catalog.updateProduct(editingId, buildInput())
      } else {
        await api.catalog.createProduct(buildInput())
      }
      setForm(EMPTY_FORM)
      setEditingId(null)
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  function handleEdit(product: Product): void {
    setError(null)
    setEditingId(product.id)
    setForm(toFormState(product))
  }

  function handleCancelEdit(): void {
    setError(null)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleDelete(product: Product): Promise<void> {
    await api.catalog.deleteProduct(product.id)
    if (editingId === product.id) handleCancelEdit()
    await reload()
  }

  return (
    <section>
      <h2>Productos</h2>
      {error && <p role="alert">{error}</p>}
      <ul>
        {products.map((product) => (
          <li key={product.id}>
            {product.name} - ${product.price} (costo: {product.cost ?? 'sin capturar'})
            <button type="button" onClick={() => handleEdit(product)}>
              Editar
            </button>
            <button type="button" onClick={() => handleDelete(product)}>
              Eliminar
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          handleSave()
        }}
      >
        <input
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          placeholder="Nombre"
        />
        <input
          value={form.price}
          onChange={(event) => setForm({ ...form, price: event.target.value })}
          placeholder="Precio de venta"
          type="number"
        />
        <input
          value={form.cost}
          onChange={(event) => setForm({ ...form, cost: event.target.value })}
          placeholder="Costo (opcional)"
          type="number"
        />
        <select
          value={form.departmentId}
          onChange={(event) => setForm({ ...form, departmentId: event.target.value })}
        >
          <option value="">Selecciona un departamento</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
        <input
          value={form.barcode}
          onChange={(event) => setForm({ ...form, barcode: event.target.value })}
          placeholder="Codigo de barras (opcional)"
        />
        <button type="submit">{editingId !== null ? 'Guardar cambios' : 'Guardar producto'}</button>
        {editingId !== null && (
          <button type="button" onClick={handleCancelEdit}>
            Cancelar
          </button>
        )}
      </form>
    </section>
  )
}

export default Productos
