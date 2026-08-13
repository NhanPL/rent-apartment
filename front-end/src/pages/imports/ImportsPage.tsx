import { DownloadOutlined, FileTextOutlined, ImportOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Empty, List, Segmented, Space, Table, Typography, Upload, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import Papa from 'papaparse'
import { useMemo, useState } from 'react'
import { useI18n } from '../../i18n'
import { commitImport, previewImport, type ImportEntity, type ImportPreview } from '../../services/importsService'
import { getUserErrorMessage } from '../../services/errorMessage'
import './ImportsPage.css'

const templates: Record<ImportEntity, string[]> = {
  BUILDING: ['code', 'name', 'address', 'note'],
  ROOM: ['building_code', 'code', 'floor', 'area_m2', 'status', 'base_rent', 'deposit_default', 'max_occupants', 'note'],
  TENANT: ['full_name', 'email', 'phone', 'identity_number', 'dob', 'gender', 'identity_issued_date', 'identity_issued_place', 'permanent_address', 'status', 'note'],
}

const exampleRows: Record<ImportEntity, string[]> = {
  BUILDING: ['BLD-A', 'Sunrise Apartments', '1 Main Street', ''],
  ROOM: ['BLD-A', 'A101', '1', '25', 'ACTIVE', '5000000', '5000000', '2', ''],
  TENANT: ['Nguyen Van A', 'tenant@example.com', '0900000000', '001234567890', '1995-01-15', 'MALE', '2020-01-15', 'Ha Noi', 'Ha Noi', 'ACTIVE', ''],
}

const downloadTemplate = (entity: ImportEntity) => {
  const csv = Papa.unparse([Object.fromEntries(templates[entity].map((header, index) => [header, exampleRows[entity][index]]))])
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${entity.toLocaleLowerCase()}-import-template.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ImportsPage() {
  const { t } = useI18n()
  const [entity, setEntity] = useState<ImportEntity>('BUILDING')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [committing, setCommitting] = useState(false)

  const columns = useMemo<ColumnsType<Record<string, unknown>>>(() => templates[entity].map((key) => ({
    title: key,
    dataIndex: key,
    width: 150,
    ellipsis: true,
    render: (value: unknown) => String(value ?? ''),
  })), [entity])

  const resetFile = (nextEntity = entity) => {
    setEntity(nextEntity)
    setFileName('')
    setRows([])
    setPreview(null)
  }

  const readCsv = (file: File) => {
    if (file.size > 1024 * 1024) {
      message.error(t('CSV file must not exceed 1 MB.'))
      return Upload.LIST_IGNORE
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim(),
      complete: (result) => {
        if (result.errors.length) {
          message.error(result.errors[0].message)
          resetFile()
          return
        }
        const parsedRows = result.data.map((row) => Object.fromEntries(
          Object.entries(row).filter(([key]) => key && key !== '__parsed_extra').map(([key, value]) => [key.trim(), value?.trim() ?? '']),
        ))
        if (!parsedRows.length || parsedRows.length > 500) {
          message.error(t('CSV must contain between 1 and 500 data rows.'))
          resetFile()
          return
        }
        setFileName(file.name)
        setRows(parsedRows)
        setPreview(null)
      },
    })
    return false
  }

  const runPreview = async () => {
    setPreviewing(true)
    try {
      setPreview(await previewImport(entity, rows))
    } catch (error) {
      message.error(getUserErrorMessage(error, t('Unable to validate import file.')))
    } finally {
      setPreviewing(false)
    }
  }

  const runCommit = async () => {
    setCommitting(true)
    try {
      const result = await commitImport(entity, rows)
      if (result.failed.length) {
        message.warning(`${result.imported}/${rows.length} ${t('rows imported. Review failed rows and retry.')}`)
      } else {
        message.success(`${result.imported} ${t('rows imported successfully.')}`)
      }
      resetFile()
    } catch (error) {
      message.error(getUserErrorMessage(error, t('Unable to import data.')))
    } finally {
      setCommitting(false)
    }
  }

  return (
    <Space direction="vertical" size={16} className="imports-page">
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>{t('Data import')}</Typography.Title>
        <Typography.Text type="secondary">{t('Validate CSV data before adding buildings, rooms, or tenant profiles.')}</Typography.Text>
      </div>

      <Card>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Segmented<ImportEntity>
            value={entity}
            options={[
              { value: 'BUILDING', label: t('Buildings') },
              { value: 'ROOM', label: t('Rooms') },
              { value: 'TENANT', label: t('Tenants') },
            ]}
            onChange={(value) => resetFile(value)}
          />
          <Space wrap>
            <Button aria-label={t('Download CSV template')} icon={<DownloadOutlined />} onClick={() => downloadTemplate(entity)}>{t('Download CSV template')}</Button>
            <Upload accept=".csv,text/csv" showUploadList={false} beforeUpload={readCsv} maxCount={1}>
              <Button type="primary" aria-label={t('Choose CSV file')} icon={<UploadOutlined />}>{t('Choose CSV file')}</Button>
            </Upload>
            {fileName ? <Typography.Text><FileTextOutlined /> {fileName}</Typography.Text> : null}
          </Space>
        </Space>
      </Card>

      <Card
        title={`${t('Preview')} (${rows.length})`}
        extra={<Space>
          <Button disabled={!rows.length} loading={previewing} onClick={() => void runPreview()}>{t('Validate')}</Button>
          <Button type="primary" aria-label={t('Import valid rows')} icon={<ImportOutlined />} disabled={!preview?.valid} loading={committing} onClick={() => void runCommit()}>{t('Import valid rows')}</Button>
        </Space>}
      >
        {preview ? (
          <Alert
            showIcon
            type={preview.valid ? 'success' : 'error'}
            message={preview.valid ? t('All rows are valid and ready to import.') : t('Fix CSV errors before importing.')}
            style={{ marginBottom: 16 }}
          />
        ) : null}
        {preview?.errors.length ? (
          <List
            className="imports-errors"
            size="small"
            dataSource={preview.errors}
            renderItem={(error) => <List.Item><Typography.Text type="danger">{t('Row')} {error.row}, {error.field}: {error.message}</Typography.Text></List.Item>}
          />
        ) : null}
        {rows.length ? (
          <Table rowKey="_importRowKey" size="small" columns={columns} dataSource={rows.map((row, index) => ({ ...row, _importRowKey: index }))} scroll={{ x: 'max-content' }} pagination={{ pageSize: 10 }} />
        ) : <Empty description={t('Choose a CSV file to preview data.')} />}
      </Card>
    </Space>
  )
}
