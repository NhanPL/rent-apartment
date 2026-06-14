import { CheckCircleOutlined, CloseCircleOutlined, CreditCardOutlined, HomeOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Descriptions, Result, Skeleton, Space, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { verifyVnpayReturn, type VnpayPaymentResult } from '../../services/paymentsService'

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })

const statusColor: Record<VnpayPaymentResult['status'], string> = {
  SUCCEEDED: 'green',
  FAILED: 'red',
  CANCELLED: 'default',
}

function goTo(path: string) {
  window.location.assign(path)
}

export function PaymentResultPage() {
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<VnpayPaymentResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const queryParams = useMemo(() => new URLSearchParams(window.location.search), [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        if (!queryParams.has('vnp_TxnRef')) {
          setError('Missing VNPAY response data.')
          return
        }
        setResult(await verifyVnpayReturn(queryParams))
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to verify VNPAY result.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [queryParams])

  if (loading) {
    return <Skeleton active paragraph={{ rows: 8 }} />
  }

  if (error) {
    return (
      <Result
        status="error"
        icon={<CloseCircleOutlined />}
        title="Payment result unavailable"
        subTitle={error}
        extra={<Button icon={<HomeOutlined />} onClick={() => goTo('/my-room')}>Back to My Room</Button>}
      />
    )
  }

  if (!result) {
    return null
  }

  const resultStatus = result.success ? 'success' : result.status === 'CANCELLED' ? 'warning' : 'error'

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Result
        status={resultStatus}
        icon={result.success ? <CheckCircleOutlined /> : <CreditCardOutlined />}
        title={result.success ? 'Payment successful' : result.status === 'CANCELLED' ? 'Payment cancelled' : 'Payment failed'}
        subTitle={result.message}
        extra={[
          <Button key="room" type="primary" icon={<HomeOutlined />} onClick={() => goTo('/my-room')}>
            Back to My Room
          </Button>,
          <Button key="retry" icon={<ReloadOutlined />} onClick={() => goTo('/my-room')}>
            View Invoice
          </Button>,
        ]}
      />

      {!result.signature_valid ? (
        <Alert showIcon type="error" message="The VNPAY signature is invalid. No payment was confirmed." />
      ) : null}

      <Card title="VNPAY transaction">
        <Descriptions bordered column={{ xs: 1, md: 2 }} size="small">
          <Descriptions.Item label="Status">
            <Tag color={statusColor[result.status]}>{result.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Result code">{result.code}</Descriptions.Item>
          <Descriptions.Item label="Amount">{result.amount === null ? '-' : currency.format(result.amount)}</Descriptions.Item>
          <Descriptions.Item label="Paid at">{result.paid_at ? dayjs(result.paid_at).format('DD/MM/YYYY HH:mm') : '-'}</Descriptions.Item>
          <Descriptions.Item label="Invoice ID">
            <Typography.Text copyable={Boolean(result.invoice_id)}>{result.invoice_id ?? '-'}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="Order ref">
            <Typography.Text copyable={Boolean(result.merchant_order_id)}>{result.merchant_order_id ?? '-'}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="Provider txn">
            <Typography.Text copyable={Boolean(result.provider_txn_id)}>{result.provider_txn_id ?? '-'}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="Already confirmed">{result.already_confirmed ? 'Yes' : 'No'}</Descriptions.Item>
        </Descriptions>
      </Card>
    </Space>
  )
}
