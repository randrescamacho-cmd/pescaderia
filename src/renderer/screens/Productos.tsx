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

/**
 * Pantalla de Productos (tasks.md 4.8, Admin only). Formulario CRUD: nombre,
 * precio, costo (opcional -- catalog-management/spec.md "Product Cost and
 * Missing-Cost Handling"), departamento (obligatorio, fijo por producto) y
 * codigo de barras (opcional).
 */
function Productos(): React.JSX.Element {
  const [products, setProducts] = useState<Product[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)

  async function reload(): Promise<void> {
    setProducts(await api.catalog.listProducts())
    setDepartments(await api.catalog.listDepartments())
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleCreate(): Promise<void> {
    setError(null)
    try {
      await api.catalog.createProduct({
        name: form.name.trim(),
        price: Number(form.price),
        cost: form.cost.trim() ? Number(form.cost) : null,
        departmentId: form.departmentId ? Number(form.departmentId) : null,
        barcode: form.barcode.trim() || null
      })
      setForm(EMPTY_FORM)
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function handleDelete(product: Product): Promise<void> {
    await api.catalog.deleteProduct(product.id)
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
            <button type="button" onClick={() => handleDelete(product)}>
              Eliminar
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          handleCreate()
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
        <button type="submit">Guardar producto</button>
      </form>
    </section>
  )
}

export default Productos
