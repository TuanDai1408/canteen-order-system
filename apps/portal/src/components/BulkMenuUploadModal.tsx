import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
  Trash2,
  Eye,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';
import {
  formatVnd,
  bulkCreateMenuItems,
  getTomorrowStr,
  type UserProfile,
  type MenuItem,
} from '@canteen/shared';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onSuccess: (count: number) => void;
}

interface ParsedDish {
  name: string;
  category: string;
  price: number;
  preparedStock: number;
  description: string;
  imageUrl: string;
  forDate?: string;
  isValid: boolean;
  error?: string;
}

const normalizeCategory = (cat?: string): 'Cơm trưa' | 'Bún / Phở' | 'Món Chay' | 'Đồ uống / Tráng miệng' => {
  if (!cat) return 'Cơm trưa';
  const lower = cat.toLowerCase();
  if (
    lower.includes('bún') ||
    lower.includes('phở') ||
    lower.includes('mì') ||
    lower.includes('hủ tiếu') ||
    lower.includes('miến')
  ) {
    return 'Bún / Phở';
  }
  if (lower.includes('chay') || lower.includes('rau') || lower.includes('đậu')) {
    return 'Món Chay';
  }
  if (
    lower.includes('uống') ||
    lower.includes('nước') ||
    lower.includes('sữa') ||
    lower.includes('chè') ||
    lower.includes('tráng miệng') ||
    lower.includes('trà') ||
    lower.includes('cà phê')
  ) {
    return 'Đồ uống / Tráng miệng';
  }
  return 'Cơm trưa';
};

export function BulkMenuUploadModal({
  isOpen,
  onClose,
  currentUser,
  onSuccess,
}: Props) {
  const [parsedItems, setParsedItems] = useState<ParsedDish[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // 1. Hàm tạo và tải file Excel mẫu (.xlsx)
  const handleDownloadTemplate = () => {
    const sampleData = [
      {
        'Tên món ăn (*)': 'Cơm tấm sườn bì chả đặc biệt',
        'Danh mục': 'Cơm trưa',
        'Đơn giá (VNĐ)': 40000,
        'Số lượng chuẩn bị': 60,
        'Mô tả': 'Sườn nướng mật ong, bì thính, chả trứng hấp, kèm canh rau ngót',
        'Link ảnh (tùy chọn)': 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600',
        'Ngày phục vụ (YYYY-MM-DD)': '',
      },
      {
        'Tên món ăn (*)': 'Bún bò Huế giò heo',
        'Danh mục': 'Bún / Phở',
        'Đơn giá (VNĐ)': 35000,
        'Số lượng chuẩn bị': 50,
        'Mô tả': 'Bún sợi to, nạm bò mềm, giò heo thơm cay đậm đà, rau sống đầy đủ',
        'Link ảnh (tùy chọn)': 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600',
        'Ngày phục vụ (YYYY-MM-DD)': '',
      },
      {
        'Tên món ăn (*)': 'Cơm cá thu sốt cà chua',
        'Danh mục': 'Cơm trưa',
        'Đơn giá (VNĐ)': 35000,
        'Số lượng chuẩn bị': 45,
        'Mô tả': 'Cá thu Nhật chiên giòn sốt cà, kèm rau cải luộc và canh chua',
        'Link ảnh (tùy chọn)': '',
        'Ngày phục vụ (YYYY-MM-DD)': '',
      },
      {
        'Tên món ăn (*)': 'Canh bí đao nấu sườn non',
        'Danh mục': 'Món thêm / Canh',
        'Đơn giá (VNĐ)': 15000,
        'Số lượng chuẩn bị': 40,
        'Mô tả': 'Canh bí đao ngọt thanh, sườn non ninh mềm',
        'Link ảnh (tùy chọn)': '',
        'Ngày phục vụ (YYYY-MM-DD)': '',
      },
      {
        'Tên món ăn (*)': 'Sữa tươi trân châu đường đen',
        'Danh mục': 'Tráng miệng / Đồ uống',
        'Đơn giá (VNĐ)': 20000,
        'Số lượng chuẩn bị': 30,
        'Mô tả': 'Sữa tươi thanh trùng, trân châu nấu đường nâu dẻo mềm',
        'Link ảnh (tùy chọn)': '',
        'Ngày phục vụ (YYYY-MM-DD)': '',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);

    // Căn chỉnh độ rộng cột
    ws['!cols'] = [
      { wch: 32 }, // Tên món
      { wch: 18 }, // Danh mục
      { wch: 16 }, // Đơn giá
      { wch: 18 }, // Số lượng
      { wch: 45 }, // Mô tả
      { wch: 35 }, // Link ảnh
      { wch: 22 }, // Ngày phục vụ
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mau_Thuc_Don_Canteen');
    XLSX.writeFile(wb, 'Mau_Nhap_Thuc_Don_Canteen.xlsx');
  };

  // 2. Tìm giá trị trong object dựa trên danh sách các từ khóa tên cột
  const findValueByKeys = (row: any, keys: string[]): any => {
    const rowKeys = Object.keys(row);
    for (const key of keys) {
      const match = rowKeys.find(
        (k) =>
          k.trim().toLowerCase() === key.toLowerCase() ||
          k.trim().toLowerCase().includes(key.toLowerCase())
      );
      if (match && row[match] !== undefined && row[match] !== null) {
        return row[match];
      }
    }
    return undefined;
  };

  // 3. Xử lý đọc file tải lên (Excel / CSV / JSON)
  const processFile = async (file: File) => {
    setIsProcessingFile(true);
    setErrorMsg(null);
    setFileName(file.name);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!rawRows || rawRows.length === 0) {
        setErrorMsg('File được chọn không có dòng dữ liệu nào.');
        setParsedItems([]);
        setIsProcessingFile(false);
        return;
      }

      const list: ParsedDish[] = rawRows.map((row) => {
        // Tên món
        const rawName =
          findValueByKeys(row, [
            'Tên món ăn (*)',
            'Tên món ăn',
            'Tên món',
            'Tên',
            'Name',
            'Dish Name',
            'Dish',
            'Món ăn',
            'Món',
          ]) || '';

        const name = String(rawName).trim();

        // Danh mục
        const rawCat =
          findValueByKeys(row, ['Danh mục', 'Phân loại', 'Category', 'Loại món', 'Loại', 'Nhóm']) ||
          'Cơm trưa';
        const category = String(rawCat).trim() || 'Cơm trưa';

        // Đơn giá
        const rawPrice = findValueByKeys(row, [
          'Đơn giá (VNĐ)',
          'Đơn giá',
          'Giá tiền',
          'Giá',
          'Price',
          'Cost',
          'Mức giá',
        ]);
        let price = 35000;
        if (rawPrice !== undefined && rawPrice !== '') {
          const num = Number(String(rawPrice).replace(/[^0-9]/g, ''));
          if (!isNaN(num) && num > 0) price = num;
        }

        // Số lượng nấu
        const rawStock = findValueByKeys(row, [
          'Số lượng chuẩn bị',
          'Số lượng nấu',
          'Số lượng',
          'Số suất',
          'Suất',
          'Prepared Stock',
          'Stock',
          'Quantity',
          'Số phần',
        ]);
        let preparedStock = 50;
        if (rawStock !== undefined && rawStock !== '') {
          const num = Number(String(rawStock).replace(/[^0-9]/g, ''));
          if (!isNaN(num) && num >= 0) preparedStock = num;
        }

        // Mô tả
        const rawDesc =
          findValueByKeys(row, [
            'Mô tả',
            'Ghi chú',
            'Thành phần',
            'Description',
            'Note',
            'Chi tiết',
          ]) || '';
        const description = String(rawDesc).trim();

        // Link ảnh
        const rawImg =
          findValueByKeys(row, [
            'Link ảnh (tùy chọn)',
            'Link ảnh',
            'Hình ảnh',
            'Ảnh',
            'Image',
            'Image URL',
            'Photo',
            'URL',
          ]) || '';
        const imageUrl = String(rawImg).trim();

        // Ngày phục vụ
        const rawDate =
          findValueByKeys(row, [
            'Ngày phục vụ (YYYY-MM-DD)',
            'Ngày phục vụ',
            'Ngày',
            'Date',
            'For Date',
            'Áp dụng ngày',
          ]) || '';
        let forDate: string | undefined = undefined;
        if (rawDate) {
          const strDate = String(rawDate).trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(strDate)) {
            forDate = strDate;
          }
        }

        const isValid = name.length > 0;
        const error = isValid ? undefined : 'Thiếu tên món ăn';

        return {
          name,
          category,
          price,
          preparedStock,
          description,
          imageUrl,
          forDate,
          isValid,
          error,
        };
      });

      setParsedItems(list);
    } catch (err: any) {
      console.error('Lỗi đọc file Excel:', err);
      setErrorMsg(`Không thể đọc file: ${err.message || 'File không đúng định dạng'}`);
      setParsedItems([]);
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleRemoveItem = (index: number) => {
    setParsedItems((prev) => prev.filter((_, i) => i !== index));
  };

  // 4. Lưu toàn bộ món hợp lệ lên Supabase
  const handleSaveBulkMenu = async () => {
    const validItems = parsedItems.filter((i) => i.isValid);
    if (validItems.length === 0) {
      setErrorMsg('Không có món ăn hợp lệ để lưu vào hệ thống.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      const payload: Omit<MenuItem, 'id'>[] = validItems.map((it) => ({
        name: it.name,
        category: normalizeCategory(it.category),
        price: it.price,
        preparedStock: it.preparedStock,
        currentStock: it.preparedStock,
        description: it.description,
        imageUrl: it.imageUrl,
        isActive: true,
        forDate: it.forDate || getTomorrowStr(),
      }));

      const res = await bulkCreateMenuItems(payload, currentUser);
      if (res.success) {
        onSuccess(res.count);
        onClose();
      } else {
        setErrorMsg(res.error || 'Lỗi khi lưu dữ liệu món vào Supabase.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi hệ thống khi tải lên danh sách món.');
    } finally {
      setIsSaving(false);
    }
  };

  const validCount = parsedItems.filter((i) => i.isValid).length;
  const invalidCount = parsedItems.filter((i) => !i.isValid).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-4xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">
                Thêm mới Menu hàng loạt từ File (Excel / CSV)
              </h3>
              <p className="text-xs text-slate-500">
                Nạp nhanh hàng chục món ăn vào Thực đơn Căn tin chỉ trong 1 lần tải lên
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-600 flex items-center justify-center cursor-pointer transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Top Info & Action Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-indigo-50/70 border border-indigo-100 p-4 rounded-2xl">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-indigo-600 shrink-0" />
              <div className="text-xs text-indigo-900">
                <span className="font-bold">Chưa có file mẫu?</span> Tải file Excel mẫu chuẩn cấu trúc để điền thông tin món ăn.
              </div>
            </div>

            <button
              onClick={handleDownloadTemplate}
              className="px-4 py-2.5 bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-2xs transition cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Tải file Excel mẫu (.xlsx)</span>
            </button>
          </div>

          {/* File Upload Drop Area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
              fileName
                ? 'border-indigo-400 bg-indigo-50/30'
                : 'border-slate-300 hover:border-indigo-500 hover:bg-slate-50/80 bg-slate-50/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv, .json"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="w-12 h-12 rounded-2xl bg-indigo-100/80 text-indigo-600 flex items-center justify-center">
              <Upload className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-extrabold text-slate-800">
                {fileName ? `Đã chọn: ${fileName}` : 'Bấm vào đây hoặc kéo thả file Excel / CSV vào'}
              </p>
              <p className="text-[11px] text-slate-500">
                Hỗ trợ định dạng .xlsx, .xls, .csv (Tự động nhận diện cột Tên món, Đơn giá, Số lượng, Danh mục...)
              </p>
            </div>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Loading Indicator */}
          {isProcessingFile && (
            <div className="p-6 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span>Đang đọc và phân tích cấu trúc file...</span>
            </div>
          )}

          {/* Parsed Dishes Preview Table */}
          {parsedItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    Xem trước danh sách món ({parsedItems.length} món)
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {validCount} hợp lệ
                  </span>
                  {invalidCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                      {invalidCount} lỗi
                    </span>
                  )}
                </div>

                <button
                  onClick={() => {
                    setParsedItems([]);
                    setFileName(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-xs text-slate-500 hover:text-red-600 font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa danh sách này</span>
                </button>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto max-h-[320px]">
                  <table className="w-full text-left text-xs min-w-[650px]">
                    <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">STT</th>
                        <th className="py-2.5 px-3">Tên món ăn</th>
                        <th className="py-2.5 px-3">Danh mục</th>
                        <th className="py-2.5 px-3 text-right">Đơn giá</th>
                        <th className="py-2.5 px-3 text-center">Số lượng nấu</th>
                        <th className="py-2.5 px-3">Mô tả</th>
                        <th className="py-2.5 px-3 text-center">Xóa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedItems.map((dish, idx) => (
                        <tr
                          key={idx}
                          className={dish.isValid ? 'hover:bg-slate-50/70' : 'bg-red-50/60'}
                        >
                          <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {dish.name || (
                              <span className="text-red-500 italic">Thiếu tên món (*)</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-medium">
                              {dish.category}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-extrabold text-indigo-600 whitespace-nowrap">
                            {formatVnd(dish.price)}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                            {dish.preparedStock} suất
                          </td>
                          <td className="py-2.5 px-3 max-w-[200px] truncate text-slate-500 text-[11px]">
                            {dish.description || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => handleRemoveItem(idx)}
                              className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                              title="Xóa món này khỏi danh sách tải lên"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition min-h-[42px]"
          >
            Đóng
          </button>

          <button
            type="button"
            disabled={isSaving || validCount === 0}
            onClick={handleSaveBulkMenu}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md shadow-indigo-600/25 min-h-[42px] flex items-center gap-2 transition"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Đang lưu {validCount} món vào Supabase...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>Xác nhận thêm {validCount} món vào Menu</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
