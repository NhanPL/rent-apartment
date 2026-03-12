import dayjs from 'dayjs'
import type { RentalContractExportData } from '../pages/tenants/types'

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })

interface ContractSection {
  heading: string
  lines: string[]
}

interface ZipEntry {
  path: string
  data: Uint8Array
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Không xác định'
  }

  return dayjs(value).format('DD/MM/YYYY')
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function makeParagraph(text: string, options?: { center?: boolean; bold?: boolean }): string {
  const runs = options?.bold
    ? `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`
    : `<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`

  const align = options?.center ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : ''

  return `<w:p>${align}${runs}</w:p>`
}

function buildContractSections(data: RentalContractExportData): ContractSection[] {
  return [
    {
      heading: 'I. THÔNG TIN BÊN CHO THUÊ',
      lines: [
        `Họ và tên: ${data.landlord.full_name}`,
        `Số điện thoại: ${data.landlord.phone ?? 'Chưa cập nhật'}`,
        `Địa chỉ: ${data.landlord.address ?? 'Chưa cập nhật'}`,
      ],
    },
    {
      heading: 'II. THÔNG TIN BÊN THUÊ',
      lines: [
        `Họ và tên: ${data.tenant.full_name}`,
        `Số điện thoại: ${data.tenant.phone}`,
        `Email: ${data.tenant.email ?? 'Chưa cập nhật'}`,
        `CCCD/Hộ chiếu: ${data.tenant.identity_number}`,
        `Địa chỉ thường trú: ${data.tenant.permanent_address ?? 'Chưa cập nhật'}`,
      ],
    },
    {
      heading: 'III. THÔNG TIN PHÒNG THUÊ',
      lines: [
        `Tòa nhà: ${data.building.name}`,
        `Địa chỉ tòa nhà: ${data.building.address}`,
        `Phòng: ${data.room.code}`,
        `Tầng: ${data.room.floor ?? 'Chưa cập nhật'}`,
        `Diện tích: ${data.room.area_m2 ?? 'Chưa cập nhật'} m²`,
      ],
    },
    {
      heading: 'IV. ĐIỀU KHOẢN HỢP ĐỒNG',
      lines: [
        `Mã hợp đồng: ${data.contract.contract_code ?? 'Chưa cấp mã'}`,
        `Ngày bắt đầu: ${formatDate(data.contract.start_date)}`,
        `Ngày kết thúc: ${formatDate(data.contract.end_date)}`,
        `Tiền thuê hàng tháng: ${currency.format(data.contract.rent_price)}`,
        `Tiền cọc: ${currency.format(data.contract.deposit_amount)}`,
        `Ngày thanh toán hàng tháng: Ngày ${data.contract.billing_day}`,
        `Ghi chú: ${data.contract.note ?? 'Không có'}`,
      ],
    },
    {
      heading: 'V. CAM KẾT CHUNG',
      lines: [
        'Hai bên cam kết thực hiện đầy đủ các nội dung đã thỏa thuận trong hợp đồng.',
        'Mọi sửa đổi/bổ sung hợp đồng phải được lập thành văn bản và có chữ ký xác nhận của hai bên.',
        'Hợp đồng được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản.',
      ],
    },
  ]
}

function createDocumentXml(data: RentalContractExportData): string {
  const sections = buildContractSections(data)

  const intro = [
    makeParagraph('HỢP ĐỒNG THUÊ PHÒNG TRỌ', { center: true, bold: true }),
    makeParagraph(`Ngày lập: ${dayjs().format('DD/MM/YYYY')}`, { center: true }),
    makeParagraph(' '),
  ]

  const body = sections.flatMap((section) => [makeParagraph(section.heading, { bold: true }), ...section.lines.map((line) => makeParagraph(line)), makeParagraph(' ')])

  const signature = [
    makeParagraph('ĐẠI DIỆN BÊN CHO THUÊ                                 ĐẠI DIỆN BÊN THUÊ', { bold: true }),
    makeParagraph('         (Ký, ghi rõ họ tên)                                      (Ký, ghi rõ họ tên)'),
    makeParagraph(' '),
    makeParagraph(' '),
    makeParagraph(`Bên cho thuê: ${data.landlord.full_name}`),
    makeParagraph(`Bên thuê: ${data.tenant.full_name}`),
  ]

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" mc:Ignorable="w14 wp14">
  <w:body>
    ${[...intro, ...body, ...signature].join('\n    ')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
}

function rootRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
}

function stringToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff

  for (let i = 0; i < data.length; i += 1) {
    crc ^= data[i]
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }

  return (crc ^ 0xffffffff) >>> 0
}

function buildStoredZip(entries: ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const fileName = stringToBytes(entry.path)
    const data = entry.data
    const crc = crc32(data)

    const localHeader = new Uint8Array(30 + fileName.length)
    const localView = new DataView(localHeader.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0, true)
    localView.setUint16(8, 0, true)
    localView.setUint16(10, 0, true)
    localView.setUint16(12, 0, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, data.length, true)
    localView.setUint32(22, data.length, true)
    localView.setUint16(26, fileName.length, true)
    localView.setUint16(28, 0, true)
    localHeader.set(fileName, 30)

    localParts.push(localHeader, data)

    const centralHeader = new Uint8Array(46 + fileName.length)
    const centralView = new DataView(centralHeader.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, 0, true)
    centralView.setUint16(14, 0, true)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, data.length, true)
    centralView.setUint32(24, data.length, true)
    centralView.setUint16(28, fileName.length, true)
    centralView.setUint16(30, 0, true)
    centralView.setUint16(32, 0, true)
    centralView.setUint16(34, 0, true)
    centralView.setUint16(36, 0, true)
    centralView.setUint32(38, 0, true)
    centralView.setUint32(42, offset, true)
    centralHeader.set(fileName, 46)

    centralParts.push(centralHeader)
    offset += localHeader.length + data.length
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const localSize = localParts.reduce((sum, part) => sum + part.length, 0)

  const endRecord = new Uint8Array(22)
  const endView = new DataView(endRecord.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(4, 0, true)
  endView.setUint16(6, 0, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, localSize, true)
  endView.setUint16(20, 0, true)

  const combined = new Uint8Array(localSize + centralSize + endRecord.length)
  let cursor = 0

  for (const part of localParts) {
    combined.set(part, cursor)
    cursor += part.length
  }

  for (const part of centralParts) {
    combined.set(part, cursor)
    cursor += part.length
  }

  combined.set(endRecord, cursor)

  return combined
}

function downloadBlob(blob: Blob, fileName: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName
  link.style.display = 'none'

  document.body.append(link)
  link.click()
  link.remove()

  window.setTimeout(() => URL.revokeObjectURL(link.href), 0)
}

function normalizeFileToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

export async function exportRentalContractDocx(data: RentalContractExportData): Promise<void> {
  const files: ZipEntry[] = [
    { path: '[Content_Types].xml', data: stringToBytes(contentTypesXml()) },
    { path: '_rels/.rels', data: stringToBytes(rootRelationshipsXml()) },
    { path: 'word/document.xml', data: stringToBytes(createDocumentXml(data)) },
  ]

  const zipBytes = buildStoredZip(files)
  const fileName = `rental-contract-${normalizeFileToken(data.tenant.full_name)}-${normalizeFileToken(data.room.code)}.docx`
  const blob = new Blob([zipBytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })

  downloadBlob(blob, fileName)
}
