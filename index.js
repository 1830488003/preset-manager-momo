// 使用 jQuery 确保在 DOM 加载完毕后执行我们的代码
jQuery(async () => {
    // -----------------------------------------------------------------
    // 1. 定义常量和状态变量
    // -----------------------------------------------------------------
    const extensionName = "preset-manager-momo";
    const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

    // HTML-safe escape function
    const escapeHtml = (unsafe) => {
        if (unsafe === null || typeof unsafe === "undefined") return "";
        return String(unsafe)
            .replace(/&/g, "&")
            .replace(/</g, "<")
            .replace(/>/g, ">")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

    // 存储键
    const PRESET_STORAGE_KEY = "momo_preset_manager_presets";
    const STORAGE_KEY_BUTTON_POS = "momo-preset-manager-button-position";
    const STORAGE_KEY_ENABLED = "momo-preset-manager-enabled";

    // DOM IDs and Selectors
    const BUTTON_ID = "momo-preset-manager-button";
    const OVERLAY_ID = "momo-preset-manager-popup-overlay";
    const POPUP_ID = "momo-preset-manager-popup";
    const CLOSE_BUTTON_ID = "momo-preset-manager-popup-close-button";
    const TOGGLE_ID = "#momo-preset-manager-enabled-toggle";

    // DOM 元素引用
    let mainView,
        selectView,
        modifyView,
        generatorView,
        designerView,
        deleteView,
        transferView, // 新增：条目迁移视图
        bookList,
        presetListContainer,
        overlay;
    let worldbookListContainer,
        deleteWorldbookBtn,
        constantEntriesContainer,
        normalEntriesContainer,
        deleteEntryBtn;
    let selectBookBtn, loadPresetBtn, savePresetBtn;
    // -- "编辑世界书"区域
    let editWorldbookSelect, editActionsContainer;
    let gotoModifyBtn,
        gotoDeleteBtn,
        gotoGeneratorBtn,
        gotoDesignerBtn,
        gotoTransferBtn; // 新增：跳转到迁移页面按钮
    // -- "修改条目"子页面
    let momoWorldbookSelect,
        momoEntrySelect,
        momoUserPrompt,
        momoAiResponse,
        momoSubmitModificationBtn,
        momoSelectedEntryContent,
        momoSaveManualChangesBtn;
    // -- "世界生成器"子页面
    let momoGeneratorPrompt,
        momoGeneratorResponse,
        momoSubmitGeneratorBtn,
        momoUploadGeneratorBtn;
    // -- "故事设计师"子页面
    let momoDesignerPrompt,
        momoDesignerResponse,
        momoSubmitDesignerBtn,
        momoUploadDesignerBtn;
    // -- "条目迁移"子页面
    let momoSourceWorldbookSelect,
        momoTargetWorldbookSelect,
        momoSourceEntriesContainer,
        momoTransferEntriesBtn;

    // -----------------------------------------------------------------
    // 2. SillyTavern API 封装 (依赖 TavernHelper)
    // -----------------------------------------------------------------

    /**
     * 延迟函数
     * @param {number} ms 毫秒
     */
    const delay = (ms) => new Promise((res) => setTimeout(res, ms));

    /**
     * 轮询等待 TavernHelper API 可用
     * @returns {Promise<object>} TavernHelper 对象
     */
    async function waitForTavernHelper(retries = 10, interval = 300) {
        for (let i = 0; i < retries; i++) {
            if (
                window.TavernHelper &&
                typeof window.TavernHelper.getLorebooks === "function"
            ) {
                console.log(
                    `[${extensionName}] TavernHelper API is available.`
                );
                return window.TavernHelper;
            }
            await delay(interval);
        }
        throw new Error(
            "TavernHelper API (from JS-Slash-Runner) is not available. Please ensure JS-Slash-Runner extension is installed and enabled."
        );
    }

    let tavernHelperApi;

    /**
     * 获取所有世界书
     * @returns {Promise<{name: string, file_name: string}[]>}
     */
    async function getAllLorebooks() {
        if (!tavernHelperApi) tavernHelperApi = await waitForTavernHelper();
        const lorebookNames = await tavernHelperApi.getLorebooks();
        // TavernHelper.getLorebooks() 返回的是文件名数组，文件名通常就是书名
        return lorebookNames.map((name) => ({ name: name, file_name: name }));
    }

    /**
     * 获取当前世界书设置
     */
    async function getLorebookSettings() {
        if (!tavernHelperApi) tavernHelperApi = await waitForTavernHelper();
        return await tavernHelperApi.getLorebookSettings();
    }

    /**
     * 设置世界书
     * @param {object} settings
     */
    async function setLorebookSettings(settings) {
        if (!tavernHelperApi) tavernHelperApi = await waitForTavernHelper();
        await tavernHelperApi.setLorebookSettings(settings);
    }

    /**
     * 获取指定世界书的所有条目
     * @param {string} bookName
     * @returns {Promise<any[]>}
     */
    async function getLorebookEntries(bookName) {
        if (!tavernHelperApi) tavernHelperApi = await waitForTavernHelper();
        // 确保函数存在
        if (typeof tavernHelperApi.getLorebookEntries !== "function") {
            console.error(
                `[${extensionName}] TavernHelper API 中缺少 getLorebookEntries 函数。`
            );
            throw new Error("TavernHelper API不完整，无法获取条目。");
        }
        return await tavernHelperApi.getLorebookEntries(bookName);
    }

    /**
     * 更新指定世界书的条目
     * @param {string} bookName
     * @param {any[]} entries
     */
    async function setLorebookEntries(bookName, entries) {
        if (!tavernHelperApi) tavernHelperApi = await waitForTavernHelper();
        // TavernHelper 中更新条目的函数是 replaceLorebookEntries
        if (typeof tavernHelperApi.replaceLorebookEntries !== "function") {
            console.error(
                `[${extensionName}] TavernHelper API 中缺少 replaceLorebookEntries 函数。`
            );
            throw new Error("TavernHelper API不完整，无法更新条目。");
        }
        // 注意：replaceLorebookEntries 会完全替换所有条目
        await tavernHelperApi.replaceLorebookEntries(bookName, entries);
    }

    /**
     * 创建一个新的世界书条目
     * @param {string} bookName
     * @param {object} entryData
     * @returns {Promise<number>} 新条目的UID
     */
    async function createLorebookEntry(bookName, entryData) {
        if (!tavernHelperApi) tavernHelperApi = await waitForTavernHelper();
        if (typeof tavernHelperApi.createLorebookEntry !== "function") {
            console.error(
                `[${extensionName}] TavernHelper API 中缺少 createLorebookEntry 函数。`
            );
            throw new Error("TavernHelper API不完整，无法创建条目。");
        }
        return await tavernHelperApi.createLorebookEntry(bookName, entryData);
    }

    // -----------------------------------------------------------------
    // 3. 弹窗和视图管理
    // -----------------------------------------------------------------
    function showPopup() {
        if (overlay) overlay.css("display", "flex"); // 使用 flex 来居中
        showMainView();
    }

    function closePopup() {
        if (overlay) overlay.hide();
    }

    /**
     * 显示主视图，隐藏所有子视图
     */
    function showMainView() {
        mainView.show();
        selectView.hide();
        modifyView.hide();
        generatorView.hide();
        designerView.hide();
        deleteView.hide();
        transferView.hide(); // 新增
        renderPresets(); // 刷新预设列表
    }

    /**
     * 根据ID显示指定的子视图
     * @param {string} viewId 要显示的视图的ID
     */
    async function showSubView(viewId) {
        mainView.hide();
        // 隐藏所有可能的子视图
        [
            selectView,
            modifyView,
            generatorView,
            designerView,
            deleteView,
            transferView, // 新增
        ].forEach((v) => (v ? v.hide() : null));

        // 根据要显示的视图执行预加载操作
        if (viewId === "momo-select-view") {
            await renderWorldBooks();
        }
        if (viewId === "momo-modify-view") {
            await populateWorldbookSelect();
            // 自动选中主界面选择的书
            const selectedBook = editWorldbookSelect.val();
            if (selectedBook) {
                momoWorldbookSelect.val(selectedBook).trigger("change");
            }
        }
        if (viewId === "momo-transfer-view") {
            await populateTransferSelects();
        }

        // 显示目标视图
        $(`#${viewId}`).show();
    }

    // -----------------------------------------------------------------
    // 4. 浮动按钮管理
    // -----------------------------------------------------------------
    function makeButtonDraggable($button) {
        let isDragging = false,
            offset = { x: 0, y: 0 },
            wasDragged = false;

        // 统一的事件处理函数
        function dragStart(e) {
            isDragging = true;
            wasDragged = false;
            $button.css("cursor", "grabbing");

            // 兼容触摸和鼠标事件
            const touch = e.touches ? e.touches[0] : e;
            const buttonPos = $button.offset();
            offset = {
                x: touch.clientX - buttonPos.left,
                y: touch.clientY - buttonPos.top,
            };
        }

        function dragMove(e) {
            if (!isDragging) return;
            wasDragged = true;
            // 阻止页面滚动
            e.preventDefault();

            // 兼容触摸和鼠标事件
            const touch = e.touches ? e.touches[0] : e;
            $button.css({
                top: `${touch.clientY - offset.y}px`,
                left: `${touch.clientX - offset.x}px`,
                right: "auto",
                bottom: "auto",
            });
        }

        function dragEnd() {
            if (!isDragging) return;
            isDragging = false;
            $button.css("cursor", "grab");
            localStorage.setItem(
                STORAGE_KEY_BUTTON_POS,
                JSON.stringify({
                    top: $button.css("top"),
                    left: $button.css("left"),
                })
            );
        }

        // 绑定事件
        $button.on("mousedown touchstart", dragStart);
        $(document).on("mousemove touchmove", dragMove);
        $(document).on("mouseup touchend", dragEnd);

        $button.on("click", function (e) {
            if (wasDragged) {
                e.preventDefault(); // 如果拖动了，就阻止点击事件
            } else {
                showPopup();
            }
        });
    }

    function handleWindowResize($button) {
        let resizeTimeout;
        $(window).on("resize.momo-preset-manager", () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (!$button.length) return;
                const maxLeft = $(window).width() - $button.outerWidth(),
                    maxTop = $(window).height() - $button.outerHeight();
                let { left, top } = $button.offset();
                if (left > maxLeft) $button.css("left", `${maxLeft}px`);
                if (left < 0) $button.css("left", "0px");
                if (top > maxTop) $button.css("top", `${maxTop}px`);
                if (top < 0) $button.css("top", "0px");
                localStorage.setItem(
                    STORAGE_KEY_BUTTON_POS,
                    JSON.stringify({
                        top: $button.css("top"),
                        left: $button.css("left"),
                    })
                );
            }, 150);
        });
    }

    function initializeFloatingButton() {
        if ($(`#${BUTTON_ID}`).length) return;
        $("body").append(
            `<div id="${BUTTON_ID}" title="预设管理器"><i class="fa-solid fa-sliders"></i></div>`
        );
        const $button = $(`#${BUTTON_ID}`);
        const savedPos = JSON.parse(
            localStorage.getItem(STORAGE_KEY_BUTTON_POS)
        );
        $button.css(
            savedPos
                ? { top: savedPos.top, left: savedPos.left }
                : { top: "150px", right: "20px" }
        );
        makeButtonDraggable($button);
        handleWindowResize($button);
    }

    function destroyFloatingButton() {
        $(`#${BUTTON_ID}`).remove();
        $(window).off("resize.momo-preset-manager");
    }

    // -----------------------------------------------------------------
    // 4.5 更新器模块 (移植自 quest-system-extension)
    // -----------------------------------------------------------------
    const Updater = {
        gitRepoOwner: "1830488003", // 假设的仓库所有者
        gitRepoName: "preset-manager-momo", // 假设的仓库名
        currentVersion: "0.0.0",
        latestVersion: "0.0.0",
        changelogContent: "",

        async fetchRawFileFromGitHub(filePath) {
            const url = `https://raw.githubusercontent.com/${this.gitRepoOwner}/${this.gitRepoName}/main/${filePath}`;
            const response = await fetch(url, { cache: "no-cache" });
            if (!response.ok) {
                throw new Error(
                    `Failed to fetch ${filePath} from GitHub: ${response.statusText}`
                );
            }
            return response.text();
        },

        parseVersion(content) {
            try {
                return JSON.parse(content).version || "0.0.0";
            } catch (error) {
                console.error("Failed to parse version:", error);
                return "0.0.0";
            }
        },

        compareVersions(v1, v2) {
            const parts1 = v1.split(".").map(Number);
            const parts2 = v2.split(".").map(Number);
            for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
                const p1 = parts1[i] || 0;
                const p2 = parts2[i] || 0;
                if (p1 > p2) return 1;
                if (p1 < p2) return -1;
            }
            return 0;
        },

        async performUpdate() {
            // SillyTavern 的上下文现在应该可以通过 getContext() 安全获取
            const context = SillyTavern.getContext();
            const { getRequestHeaders } = context.common;
            const { extension_types } = context.extensions;
            toastr.info("正在开始更新...");
            try {
                const response = await fetch("/api/extensions/update", {
                    method: "POST",
                    headers: getRequestHeaders(),
                    body: JSON.stringify({
                        extensionName: extensionName, // 使用全局的 extensionName
                        global: extension_types[extensionName] === "global",
                    }),
                });
                if (!response.ok) throw new Error(await response.text());

                toastr.success("更新成功！将在3秒后刷新页面应用更改。");
                setTimeout(() => location.reload(), 3000);
            } catch (error) {
                toastr.error(`更新失败: ${error.message}`);
            }
        },

        async showUpdateConfirmDialog() {
            const context = SillyTavern.getContext();
            const { POPUP_TYPE, callGenericPopup } = context.popup;
            try {
                this.changelogContent = await this.fetchRawFileFromGitHub(
                    "CHANGELOG.md"
                );
            } catch (error) {
                this.changelogContent = `发现新版本 ${this.latestVersion}！您想现在更新吗？`;
            }
            if (
                await callGenericPopup(
                    this.changelogContent,
                    POPUP_TYPE.CONFIRM,
                    {
                        okButton: "立即更新",
                        cancelButton: "稍后",
                        wide: true,
                        large: true,
                    }
                )
            ) {
                await this.performUpdate();
            }
        },

        async checkForUpdates(isManual = false) {
            const updateButton = $("#momo-check-update-button");
            if (isManual) {
                updateButton
                    .prop("disabled", true)
                    .html('<i class="fas fa-spinner fa-spin"></i> 检查中...');
            }
            try {
                const localManifestText = await (
                    await fetch(
                        `/${extensionFolderPath}/manifest.json?t=${Date.now()}`
                    )
                ).text();
                this.currentVersion = this.parseVersion(localManifestText);
                $("#momo-current-version").text(this.currentVersion);

                const remoteManifestText = await this.fetchRawFileFromGitHub(
                    "manifest.json"
                );
                this.latestVersion = this.parseVersion(remoteManifestText);

                if (
                    this.compareVersions(
                        this.latestVersion,
                        this.currentVersion
                    ) > 0
                ) {
                    updateButton
                        .html(
                            `<i class="fa-solid fa-gift"></i> 发现新版 ${this.latestVersion}!`
                        )
                        .off("click")
                        .on("click", () => this.showUpdateConfirmDialog());
                    if (isManual)
                        toastr.success(
                            `发现新版本 ${this.latestVersion}！点击按钮进行更新。`
                        );
                } else {
                    if (isManual) toastr.info("您当前已是最新版本。");
                }
            } catch (error) {
                if (isManual) toastr.error(`检查更新失败: ${error.message}`);
            } finally {
                if (
                    isManual &&
                    this.compareVersions(
                        this.latestVersion,
                        this.currentVersion
                    ) <= 0
                ) {
                    updateButton
                        .prop("disabled", false)
                        .html(
                            '<i class="fa-solid fa-cloud-arrow-down"></i> 检查更新'
                        );
                }
            }
        },
    };

    // -----------------------------------------------------------------
    // 5. 世界书 & 预设核心逻辑
    // -----------------------------------------------------------------
    async function renderWorldBooks() {
        bookList.empty().append("<p>加载中...</p>");
        try {
            const [allBooks, settings] = await Promise.all([
                getAllLorebooks(),
                getLorebookSettings(),
            ]);
            const enabledBooks = new Set(settings.selected_global_lorebooks);
            bookList.empty();
            if (allBooks.length === 0) {
                bookList.append("<p>未找到任何世界书。</p>");
                return;
            }

            // 为每本书创建一个按钮
            allBooks.forEach((book) => {
                const isEnabled = enabledBooks.has(book.file_name);
                const bookButton = $("<button></button>")
                    .addClass("momo-book-button")
                    .toggleClass("selected", isEnabled) // 根据启用状态添加 selected 类
                    .text(book.name)
                    .data("book-filename", book.file_name) // 存储文件名
                    .on("click", handleBookClick); // 绑定点击事件

                bookList.append(bookButton);
            });
        } catch (error) {
            console.error(`[${extensionName}] 获取世界书失败:`, error);
            bookList
                .empty()
                .append(
                    `<p style="color:red;">获取世界书失败: ${error.message}</p>`
                );
        }
    }

    async function handleBookClick() {
        const button = $(this),
            bookFileName = button.data("book-filename"),
            isSelected = button.hasClass("selected");
        button.toggleClass("selected");
        try {
            const settings = await getLorebookSettings();
            let enabledBooks = settings.selected_global_lorebooks || [];
            if (isSelected) {
                enabledBooks = enabledBooks.filter(
                    (name) => name !== bookFileName
                );
            } else if (!enabledBooks.includes(bookFileName)) {
                enabledBooks.push(bookFileName);
            }
            await setLorebookSettings({
                selected_global_lorebooks: enabledBooks,
            });
        } catch (error) {
            console.error(`[${extensionName}] 更新世界书设置失败:`, error);
            button.toggleClass("selected"); // 操作失败，恢复按钮状态
            alert("更新世界书状态失败！");
        }
    }

    function getPresets() {
        try {
            return JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY)) || [];
        } catch {
            return [];
        }
    }

    function savePreset(preset) {
        const presets = getPresets();
        const existingIndex = presets.findIndex((p) => p.name === preset.name);
        if (existingIndex > -1) {
            presets[existingIndex] = preset;
        } else {
            presets.push(preset);
        }
        localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
    }

    function deletePreset(presetName) {
        let presets = getPresets().filter((p) => p.name !== presetName);
        localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
        renderPresets();
    }

    function renderPresets() {
        const presets = getPresets();
        presetListContainer.empty().hide();
        if (presets.length === 0) return;

        presets.forEach((preset) => {
            const item = $(
                `<div class="momo-preset-item"><span>${preset.name}</span><div><button class="momo-delete-preset-btn" title="删除预设">&times;</button></div></div>`
            );

            // 点击预设项（非删除按钮）来应用预设
            item.on("click", async (e) => {
                if (!$(e.target).hasClass("momo-delete-preset-btn")) {
                    await applyPreset(preset.books);
                }
            });

            // 点击删除按钮
            item.find(".momo-delete-preset-btn").on("click", (e) => {
                e.stopPropagation();
                if (confirm(`确定删除预设 "${preset.name}"?`)) {
                    deletePreset(preset.name);
                }
            });

            presetListContainer.append(item);
        });
        presetListContainer.show();
    }

    async function applyPreset(bookFileNames) {
        if (!Array.isArray(bookFileNames)) {
            alert("预设格式错误！");
            return;
        }
        try {
            // 先清空所有已启用的世界书
            await setLorebookSettings({ selected_global_lorebooks: [] });
            // 再启用预设中的世界书
            await setLorebookSettings({
                selected_global_lorebooks: bookFileNames,
            });
            alert("预设加载成功！");
            // 如果选择视图是可见的，刷新它以反映最新状态
            if (selectView.is(":visible")) {
                await renderWorldBooks();
            }
        } catch (error) {
            console.error(`[${extensionName}] 应用预设失败:`, error);
            alert("应用预设失败！");
        }
    }

    /**
     * 填充主视图中的"编辑世界书"下拉选择器
     */
    async function populateEditWorldbookSelect() {
        try {
            const books = await getAllLorebooks();
            editWorldbookSelect
                .empty()
                .append('<option value="">-- 请先选择一个世界书 --</option>');
            books.forEach((book) => {
                editWorldbookSelect.append(
                    `<option value="${escapeHtml(book.file_name)}">${escapeHtml(
                        book.name
                    )}</option>`
                );
            });
        } catch (error) {
            console.error(
                `[${extensionName}] 填充编辑区世界书下拉菜单失败:`,
                error
            );
            editWorldbookSelect
                .empty()
                .append(`<option value="">加载失败</option>`);
        }
    }

    /**
     * 填充修改视图中的世界书下拉选择器
     */
    async function populateWorldbookSelect() {
        try {
            const books = await getAllLorebooks();
            momoWorldbookSelect
                .empty()
                .append('<option value="">--请选择一个世界书--</option>');
            books.forEach((book) => {
                momoWorldbookSelect.append(
                    `<option value="${escapeHtml(book.file_name)}">${escapeHtml(
                        book.name
                    )}</option>`
                );
            });
            momoEntrySelect
                .empty()
                .append('<option value="">--先选择世界书--</option>'); // 清空并重置条目选择器
        } catch (error) {
            console.error(`[${extensionName}] 填充世界书下拉菜单失败:`, error);
            momoWorldbookSelect
                .empty()
                .append(`<option value="">加载失败</option>`);
        }
    }

    /**
     * 根据选择的世界书填充条目选择器
     */
    async function populateEntrySelect() {
        const selectedBook = momoWorldbookSelect.val();
        momoSelectedEntryContent.val(""); // 清空内容显示区
        if (!selectedBook) {
            momoEntrySelect
                .empty()
                .append('<option value="">--先选择世界书--</option>');
            return;
        }

        momoEntrySelect.empty().append('<option value="">加载中...</option>');
        try {
            const entries = await getLorebookEntries(selectedBook);
            // 将条目存储在select元素上以便后续使用
            momoEntrySelect.data("entries", entries);
            momoEntrySelect.empty();
            if (entries.length === 0) {
                momoEntrySelect.append(
                    '<option value="">该世界书没有条目</option>'
                );
                return;
            }

            momoEntrySelect.append(
                '<option value="">--选择一个条目 (或不选)--</option>'
            );
            entries.forEach((entry) => {
                const displayName = entry.comment || `条目 UID: ${entry.uid}`;
                momoEntrySelect.append(
                    `<option value="${entry.uid}">${escapeHtml(
                        displayName
                    )}</option>`
                );
            });
        } catch (error) {
            console.error(`[${extensionName}] 填充条目下拉菜单失败:`, error);
            momoEntrySelect
                .empty()
                .append(`<option value="">加载条目失败</option>`);
            momoEntrySelect.data("entries", []); // 清空缓存
        }
    }

    /**
     * 从AI返回的文本中提取和清理JSON字符串。
     * 增强版：能处理content字段内未转义的引号和换行符。
     * @param {string} rawText AI的原始输出
     * @returns {string} 清理后的、更可能合法的JSON字符串
     */
    function extractAndCleanJson(rawText) {
        if (!rawText || typeof rawText !== "string") {
            return "";
        }

        // 1. 提取被 ```json ... ``` 包裹的代码块，如果失败则使用原始文本
        const match = rawText.match(/```json\s*([\s\S]*?)\s*```/);
        let jsonString = match ? match[1] : rawText;

        // 2. 如果没有匹配到代码块，尝试粗略提取 [ ... ] 或 { ... } 之间的内容
        if (!match) {
            const firstBracket = jsonString.indexOf("[");
            const lastBracket = jsonString.lastIndexOf("]");
            const firstBrace = jsonString.indexOf("{");
            const lastBrace = jsonString.lastIndexOf("}");

            if (firstBracket !== -1 && lastBracket > firstBracket) {
                jsonString = jsonString.substring(firstBracket, lastBracket + 1);
            } else if (firstBrace !== -1 && lastBrace > firstBrace) {
                jsonString = jsonString.substring(firstBrace, lastBrace + 1);
            } else {
                // 如果找不到有效的JSON结构，可能无法修复，返回空字符串
                return "";
            }
        }
        
        // 3. 关键修复步骤：修复 `content` 字段内部的非法字符
        // 这个问题的核心是 `content` 的值是一个字符串，但其内部可能包含未转义的 " 和换行符。
        // 我们通过正则表达式匹配 "content": "..." 结构，并只对 ... 部分进行转义。
        // 正则表达式解释:
        // ("content"\s*:\s*") - 匹配 "content": " 部分，允许空格
        // ([\s\S]*?) - 非贪婪地匹配任何字符（包括换行符），这是 content 的值
        // (",\s*$) - 匹配行尾的逗号（可选），以确定 content 值的结束
        // m (multiline) 和 g (global) 标志是必须的
        try {
            // 使用一个更复杂的正则表达式，它查找 "content": "..." 直到下一个有效的 "key": 或结束的 }
            // 这是一个简化的逻辑，它按行处理，假设 content 字段的值不会跨越多行（在原始JSON文本中）
            // 如果 content 值包含 `\n`，它在文本中仍然是一行。
            const lines = jsonString.split('\n');
            const fixedLines = lines.map(line => {
                // 匹配像 "key": "value" 这样的行
                const match = line.match(/(\s*".*?"\s*:\s*")(.*?)(".*)/);
                if (match && match[1].includes('"content"')) {
                    let value = match[2];
                    // 对值进行转义：
                    // 1. 先转义反斜杠本身
                    // 2. 再转义双引号
                    value = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    return match[1] + value + match[3];
                }
                return line;
            });
            jsonString = fixedLines.join('\n');
        } catch (e) {
            console.error("JSON auto-fixing failed:", e);
            // 如果修复失败，返回原始提取的字符串，让后续逻辑处理
        }

        return jsonString.trim();
    }

    /**
     * 当条目选择变化时，更新内容显示文本域
     */
    function handleEntrySelectionChange() {
        const selectedUid = momoEntrySelect.val();
        const entries = momoEntrySelect.data("entries") || [];
        if (selectedUid) {
            const selectedEntry = entries.find((e) => e.uid == selectedUid);
            if (selectedEntry) {
                // 显示条目的 'content' 字段
                momoSelectedEntryContent.val(selectedEntry.content || "");
            } else {
                momoSelectedEntryContent.val("");
            }
        } else {
            momoSelectedEntryContent.val("");
        }
    }

    /**
     * 处理手动保存按钮的逻辑
     */
    async function handleManualSave() {
        const bookName = momoWorldbookSelect.val();
        const entryUid = momoEntrySelect.val();
        const modifiedContent = momoSelectedEntryContent.val();

        if (!bookName || !entryUid) {
            alert("请先选择一个世界书和一个具体的条目来保存。");
            return;
        }

        try {
            if (!tavernHelperApi) tavernHelperApi = await waitForTavernHelper();

            let allEntries = await getLorebookEntries(bookName);
            const entryIndex = allEntries.findIndex((e) => e.uid == entryUid);

            if (entryIndex === -1) {
                throw new Error("找不到要更新的条目。");
            }

            // 更新指定条目的content字段
            allEntries[entryIndex].content = modifiedContent;

            // 将修改后的整个条目数组写回
            await setLorebookEntries(bookName, allEntries);

            alert("手动修改已成功保存！");
            // 可选：更新缓存的条目数据以保持同步
            momoEntrySelect.data("entries", allEntries);
        } catch (error) {
            console.error(`[${extensionName}] 手动保存失败:`, error);
            alert(`手动保存失败: ${error.message}`);
        }
    }

    /**
     * 处理提交修改的逻辑
     */
    async function handleSubmitModification() {
        const bookName = momoWorldbookSelect.val();
        const entryUid = momoEntrySelect.val();
        const userPromptText = momoUserPrompt.val().trim();

        if (!bookName) {
            alert("请先选择一个世界书。");
            return;
        }
        if (!userPromptText) {
            alert("请输入你的修改要求。");
            return;
        }

        momoAiResponse.val("正在处理中，请稍候...");
        momoSubmitModificationBtn.prop("disabled", true);
        let rawAiResponse = "";

        try {
            if (!tavernHelperApi) tavernHelperApi = await waitForTavernHelper();

            const allEntries = await getLorebookEntries(bookName);
            const wholeBookContent = JSON.stringify(allEntries, null, 2);
            let targetEntry = null;
            let finalPrompt = "";

            // 通用指令头部
            const promptHeader = `你是一个专业的SillyTavern世界书JSON数据工程师。
**核心规则:**
1.  **绝对禁止**任何解释性文字、注释或额外的对话。
2.  你的输出**必须**是一个纯净、完整且格式正确的JSON对象或数组。
3.  你的输出**必须**被包裹在 \`\`\`json ... \`\`\` 代码块中。
4.  JSON内部的字符串值如果包含换行，必须使用 \`\\n\` 进行转义。
5.  **绝对不能**修改任何条目的 \`uid\` 和 \`type\` 字段。你只能修改 \`comment\` (注释), \`content\` (内容), \`keys\` (关键词) 等数据字段。`;

            if (entryUid) {
                targetEntry = allEntries.find((e) => e.uid == entryUid);
                if (!targetEntry)
                    throw new Error(
                        `未在世界书 "${bookName}" 中找到 UID 为 ${entryUid} 的条目。`
                    );

                const targetEntryContent = JSON.stringify(targetEntry, null, 2);
                finalPrompt = `${promptHeader}

**任务: ** 根据用户要求，修改下方“要修改的条目内容”JSON对象。

**世界书的完整内容 (仅供上下文参考，不要输出这个):**
\`\`\`json
${wholeBookContent}
\`\`\`

**要修改的条目内容:**
\`\`\`json
${targetEntryContent}
\`\`\`

**用户的要求:**
"${userPromptText}"

**你的输出 (必须是包裹在 \`\`\`json ... \`\`\` 中的单个JSON对象):**`;
            } else {
                finalPrompt = `${promptHeader}

**任务: ** 根据用户要求，修改下方“世界书的完整内容”JSON数组。

**世界书的完整内容:**
\`\`\`json
${wholeBookContent}
\`\`\`

**用户的要求:**
"${userPromptText}"

**你的输出 (必须是包裹在 \`\`\`json ... \`\`\` 中的单个JSON数组):**`;
            }

            rawAiResponse = await tavernHelperApi.generateRaw({
                ordered_prompts: [{ role: "user", content: finalPrompt }],
                max_new_tokens: 4096, // 根据需要调整
            });
            momoAiResponse.val(rawAiResponse); // 立即显示原始回复

            const cleanedJsonString = extractAndCleanJson(rawAiResponse);
            if (!cleanedJsonString) {
                throw new Error(
                    "AI返回的内容为空或无法提取出有效的JSON代码块。"
                );
            }

            const updatedData = JSON.parse(cleanedJsonString);
            let newEntries = [];

            if (entryUid && targetEntry) {
                const entryIndex = allEntries.findIndex(
                    (e) => e.uid == entryUid
                );
                // 保护关键字段不被修改
                const updatedEntry = {
                    ...targetEntry,
                    ...updatedData,
                    uid: targetEntry.uid,
                    type: targetEntry.type,
                };
                allEntries[entryIndex] = updatedEntry;
                newEntries = allEntries;
            } else {
                if (!Array.isArray(updatedData)) {
                    throw new Error("AI未返回预期的JSON数组。请检查AI的回复。");
                }
                newEntries = updatedData;
            }

            await setLorebookEntries(bookName, newEntries);
            alert("世界书已成功更新！");
        } catch (error) {
            console.error(`[${extensionName}] 修改世界书失败:`, error);
            // 尝试提取清理后的JSON以供调试
            const cleanedForDebug = extractAndCleanJson(rawAiResponse);
            alert(
                `操作失败: ${error.message}\n\n请检查“AI的回复”框中的内容。\n\n尝试解析的数据如下 (如果为空则表示提取失败):\n${cleanedForDebug}`
            );
        } finally {
            momoSubmitModificationBtn.prop("disabled", false);
        }
    }

    /**
     * 处理世界生成器提交的逻辑 (只生成，不上传)
     */
    async function handleGenerateWorld() {
        const bookName = editWorldbookSelect.val();
        const userPromptText = momoGeneratorPrompt.val().trim();

        if (!bookName) {
            alert("请返回主页，先选择一个要进行生成的世界书。");
            return;
        }
        if (!userPromptText) {
            alert("请输入你的生成要求。");
            return;
        }

        momoGeneratorResponse.val("正在处理中，请稍候...");
        momoSubmitGeneratorBtn.prop("disabled", true);
        momoUploadGeneratorBtn.prop("disabled", true); // 在生成期间禁用上传按钮
        let rawAiResponse = "";

        try {
            if (!tavernHelperApi) tavernHelperApi = await waitForTavernHelper();

            const [promptTemplate, currentEntries] = await Promise.all([
                $.get(`${extensionFolderPath}/world-generator-prompt.txt`),
                getLorebookEntries(bookName),
            ]);

            const currentBookContent = JSON.stringify(currentEntries, null, 2);
            let finalPrompt = promptTemplate
                .replace("[CURRENT_WORLD_BOOK_CONTENT]", currentBookContent)
                .replace("[USER_REQUEST]", userPromptText);

            rawAiResponse = await tavernHelperApi.generateRaw({
                ordered_prompts: [{ role: "user", content: finalPrompt }],
                max_new_tokens: 8192,
            });

            momoGeneratorResponse.val(rawAiResponse);
            // 成功获取回复后，启用上传按钮
            momoUploadGeneratorBtn.prop("disabled", false);
            toastr.success("AI已生成回复，请检查内容后决定是否上传。");
        } catch (error) {
            console.error(`[${extensionName}] 生成世界失败:`, error);
            momoGeneratorResponse.val(`生成失败: ${error.message}`);
            toastr.error(`操作失败: ${error.message}`);
        } finally {
            momoSubmitGeneratorBtn.prop("disabled", false);
        }
    }

    /**
     * 处理故事设计师提交的逻辑 (只生成，不上传)
     */
    async function handleGenerateStory() {
        const bookName = editWorldbookSelect.val();
        const userPromptText = momoDesignerPrompt.val().trim();

        if (!bookName) {
            alert("请返回主页，先选择一个要进行设计的故事所在的世界书。");
            return;
        }
        if (!userPromptText) {
            alert("请输入你的故事概念。");
            return;
        }

        momoDesignerResponse.val("正在设计故事，请稍候...");
        momoSubmitDesignerBtn.prop("disabled", true);
        momoUploadDesignerBtn.prop("disabled", true); // 在生成期间禁用上传按钮
        let rawAiResponse = "";

        try {
            if (!tavernHelperApi) tavernHelperApi = await waitForTavernHelper();

            const [promptTemplate, currentEntries] = await Promise.all([
                $.get(`${extensionFolderPath}/story-designer-prompt.txt`),
                getLorebookEntries(bookName),
            ]);

            const currentBookContent = JSON.stringify(currentEntries, null, 2);
            let finalPrompt = promptTemplate
                .replace("{{world_book_entries}}", currentBookContent)
                .replace("{{user_request}}", userPromptText);

            rawAiResponse = await tavernHelperApi.generateRaw({
                ordered_prompts: [{ role: "user", content: finalPrompt }],
                max_new_tokens: 8192,
            });

            momoDesignerResponse.val(rawAiResponse);
            // 成功获取回复后，启用上传按钮
            momoUploadDesignerBtn.prop("disabled", false);
            toastr.success("AI已设计好故事，请检查内容后决定是否上传。");
        } catch (error) {
            console.error(`[${extensionName}] 设计故事失败:`, error);
            momoDesignerResponse.val(`设计失败: ${error.message}`);
            toastr.error(`操作失败: ${error.message}`);
        } finally {
            momoSubmitDesignerBtn.prop("disabled", false);
        }
    }

    /**
     * 处理上传世界生成器内容到世界书的逻辑
     */
    async function handleUploadWorld() {
        const bookName = editWorldbookSelect.val();
        const rawAiResponse = momoGeneratorResponse.val();

        if (!bookName) {
            alert("无法确定要上传到哪个世界书。");
            return;
        }
        if (!rawAiResponse) {
            alert("没有可上传的内容。");
            return;
        }

        momoUploadGeneratorBtn.prop("disabled", true).text("上传中...");

        try {
            const cleanedJsonString = extractAndCleanJson(rawAiResponse);
            if (!cleanedJsonString) {
                throw new Error(
                    "AI返回的内容为空或无法提取出有效的JSON代码块。"
                );
            }

            const newGeneratedEntries = JSON.parse(cleanedJsonString);
            if (!Array.isArray(newGeneratedEntries)) {
                throw new Error("AI返回的数据解析后不是一个JSON数组。");
            }

            for (const entry of newGeneratedEntries) {
                const entryForCreation = { ...entry };
                delete entryForCreation.uid;
                await createLorebookEntry(bookName, entryForCreation);
            }
            alert(
                `成功上传 ${newGeneratedEntries.length} 个新条目到世界书 "${bookName}"！`
            );
            momoGeneratorResponse.val(
                "上传成功！可以开始下一次生成了。"
            );
        } catch (error) {
            console.error(`[${extensionName}] 上传世界内容失败:`, error);
            alert(
                `上传失败: ${error.message}\n\n请检查“AI的回复”框中的内容是否为合法的JSON数组。`
            );
            // 失败后重新启用按钮，以便用户修正后重试
            momoUploadGeneratorBtn.prop("disabled", false).text("上传到世界书");
        }
    }

    /**
     * 处理上传故事设计内容到世界书的逻辑
     */
    async function handleUploadStory() {
        const bookName = editWorldbookSelect.val();
        const rawAiResponse = momoDesignerResponse.val();

        if (!bookName) {
            alert("无法确定要上传到哪个世界书。");
            return;
        }
        if (!rawAiResponse) {
            alert("没有可上传的内容。");
            return;
        }

        momoUploadDesignerBtn.prop("disabled", true).text("上传中...");

        try {
            const cleanedJsonString = extractAndCleanJson(rawAiResponse);
            if (!cleanedJsonString) {
                throw new Error(
                    "AI返回的内容为空或无法提取出有效的JSON代码块。"
                );
            }

            const newGeneratedEntries = JSON.parse(cleanedJsonString);
            if (!Array.isArray(newGeneratedEntries)) {
                throw new Error("AI返回的数据解析后不是一个JSON数组。");
            }

            for (const entry of newGeneratedEntries) {
                const entryForCreation = { ...entry };
                delete entryForCreation.uid;
                await createLorebookEntry(bookName, entryForCreation);
            }
            alert(
                `成功上传 ${newGeneratedEntries.length} 个新条目到世界书 "${bookName}"！`
            );
            momoDesignerResponse.val("上传成功！可以开始下一次设计了。");
        } catch (error) {
            console.error(`[${extensionName}] 上传故事内容失败:`, error);
            alert(
                `上传失败: ${error.message}\n\n请检查“AI 设计的故事条目”框中的内容是否为合法的JSON数组。`
            );
            // 失败后重新启用按钮
            momoUploadDesignerBtn.prop("disabled", false).text("上传到世界书");
        }
    }

    // -----------------------------------------------------------------
    // 5.5 删除视图核心逻辑
    // -----------------------------------------------------------------

    /**
     * 删除视图：渲染所有世界书
     */
    async function renderDeleteView() {
        try {
            if (!tavernHelperApi) tavernHelperApi = await waitForTavernHelper();
            const books = await tavernHelperApi.getLorebooks();
            worldbookListContainer.empty(); // 清空
            if (books.length === 0) {
                worldbookListContainer.append("<p>没有找到世界书。</p>");
                return;
            }
            books.forEach((bookName) => {
                const bookButton = $("<button></button>")
                    .addClass("momo-book-button") // 修正：使用正确的、可切换的按钮样式
                    .text(bookName)
                    .attr("data-book-name", bookName)
                    .on("click", function () {
                        $(this).toggleClass("selected"); // 使用 .selected 类来标记选中
                        loadEntriesForSelectedBooks();
                    });
                worldbookListContainer.append(bookButton);
            });
        } catch (error) {
            console.error(`[${extensionName}] 加载世界书列表失败:`, error);
            toastr.error("加载世界书列表失败。");
        }
        // 初始时清空条目区
        loadEntriesForSelectedBooks();
    }

    /**
     * 删除视图：根据选择的世界书加载条目
     */
    async function loadEntriesForSelectedBooks() {
        constantEntriesContainer.empty();
        normalEntriesContainer.empty();
        const selectedBookButtons = worldbookListContainer.find(
            ".momo-book-button.selected"
        );

        if (selectedBookButtons.length === 0) {
            constantEntriesContainer.html(
                '<p class="momo-no-tasks">请先在上方选择一个或多个世界书。</p>'
            );
            normalEntriesContainer.html("");
            return;
        }

        try {
            if (!tavernHelperApi) tavernHelperApi = await waitForTavernHelper();
            for (const button of selectedBookButtons) {
                const bookName = $(button).data("book-name");
                const entries = await tavernHelperApi.getLorebookEntries(
                    bookName
                );

                entries.forEach((entry) => {
                    const entryButton = $("<button></button>")
                        .addClass("momo-book-button") // 修正：使用正确的、可切换的按钮样式
                        .text(entry.comment)
                        .attr("title", entry.comment) // 悬浮显示全名
                        .attr("data-uid", entry.uid)
                        .attr("data-book-name", bookName)
                        .on("click", function () {
                            $(this).toggleClass("selected");
                        });

                    // 根据类型分类
                    if (entry.type === "constant") {
                        constantEntriesContainer.append(entryButton);
                    } else {
                        normalEntriesContainer.append(entryButton);
                    }
                });
            }
            // 如果加载完条目后容器仍然是空的，显示提示
            if (constantEntriesContainer.children("button").length === 0) {
                constantEntriesContainer.html(
                    '<p class="momo-no-tasks">无蓝灯条目。</p>'
                );
            }
            if (normalEntriesContainer.children("button").length === 0) {
                normalEntriesContainer.html(
                    '<p class="momo-no-tasks">无绿灯条目。</p>'
                );
            }
        } catch (error) {
            console.error(`[${extensionName}] 加载条目失败:`, error);
            toastr.error("加载条目失败。");
        }
    }

    /**
     * 删除视图：删除选中的世界书
     */
    async function handleDeleteWorldbooks() {
        const selectedBookButtons = worldbookListContainer.find(
            ".momo-book-button.selected"
        );
        if (selectedBookButtons.length === 0) {
            toastr.warning("请先选择要删除的世界书。");
            return;
        }

        const bookNamesToDelete = selectedBookButtons
            .map((_, btn) => $(btn).data("book-name"))
            .get();

        if (
            confirm(
                `确定要永久删除选中的 ${bookNamesToDelete.length} 个世界书吗？此操作不可撤销！`
            )
        ) {
            try {
                if (!tavernHelperApi)
                    tavernHelperApi = await waitForTavernHelper();
                for (const bookName of bookNamesToDelete) {
                    await tavernHelperApi.deleteLorebook(bookName);
                }
                toastr.success("选中的世界书已成功删除。");
                renderDeleteView(); // 重新渲染
            } catch (error) {
                console.error(`[${extensionName}] 删除世界书失败:`, error);
                toastr.error("删除世界书失败。");
            }
        }
    }

    /**
     * 删除视图：删除选中的条目
     */
    async function handleDeleteEntries() {
        const selectedEntries = $(
            "#constant-entries-container .momo-book-button.selected, #normal-entries-container .momo-book-button.selected"
        );
        if (selectedEntries.length === 0) {
            toastr.warning("请先选择要删除的条目。");
            return;
        }

        const entriesToDeleteByBook = {};
        selectedEntries.each((_, block) => {
            const bookName = $(block).data("book-name");
            const uid = parseInt($(block).data("uid"), 10);
            if (!entriesToDeleteByBook[bookName]) {
                entriesToDeleteByBook[bookName] = [];
            }
            entriesToDeleteByBook[bookName].push(uid);
        });

        if (
            confirm(
                `确定要永久删除选中的 ${selectedEntries.length} 个条目吗？此操作不可撤销！`
            )
        ) {
            try {
                if (!tavernHelperApi)
                    tavernHelperApi = await waitForTavernHelper();
                for (const bookName in entriesToDeleteByBook) {
                    const uids = entriesToDeleteByBook[bookName];
                    await tavernHelperApi.deleteLorebookEntries(bookName, uids);
                }
                toastr.success("选中的条目已成功删除。");
                loadEntriesForSelectedBooks(); // 重新加载条目
            } catch (error) {
                console.error(`[${extensionName}] 删除条目失败:`, error);
                toastr.error("删除条目失败。");
            }
        }
    }

    // -----------------------------------------------------------------
    // 5.6 条目迁移核心逻辑
    // -----------------------------------------------------------------

    /**
     * 迁移视图：填充源和目标世界书的下拉选择框
     */
    async function populateTransferSelects() {
        momoSourceEntriesContainer.html(
            '<p class="momo-no-tasks">请先选择一个源世界书。</p>'
        ); // 重置
        try {
            const books = await getAllLorebooks();
            const placeholder = '<option value="">--请选择世界书--</option>';
            momoSourceWorldbookSelect.empty().append(placeholder);
            momoTargetWorldbookSelect.empty().append(placeholder);

            books.forEach((book) => {
                const option = `<option value="${escapeHtml(
                    book.file_name
                )}">${escapeHtml(book.name)}</option>`;
                momoSourceWorldbookSelect.append(option);
                momoTargetWorldbookSelect.append(option);
            });
        } catch (error) {
            console.error(`[${extensionName}] 填充迁移视图下拉菜单失败:`, error);
            toastr.error("加载世界书列表失败。");
        }
    }

    /**
     * 迁移视图：当选择源世界书后，渲染其条目
     */
    async function renderSourceEntries() {
        const sourceBook = momoSourceWorldbookSelect.val();
        if (!sourceBook) {
            momoSourceEntriesContainer.html(
                '<p class="momo-no-tasks">请先选择一个源世界书。</p>'
            );
            return;
        }

        momoSourceEntriesContainer.html("<p>加载中...</p>");
        try {
            if (!tavernHelperApi) tavernHelperApi = await waitForTavernHelper();
            const entries = await tavernHelperApi.getLorebookEntries(sourceBook);

            // 将条目数据缓存起来，以便迁移时使用
            momoSourceEntriesContainer.data("entries", entries);

            momoSourceEntriesContainer.empty();
            if (entries.length === 0) {
                momoSourceEntriesContainer.html(
                    '<p class="momo-no-tasks">该世界书没有条目。</p>'
                );
                return;
            }

            // 使用带复选框的标签来展示条目，方便多选
            entries.forEach((entry) => {
                const entryId = `momo-transfer-entry-${entry.uid}`;
                const displayName =
                    entry.comment || `条目 UID: ${entry.uid}`;
                const entryElement = $(`
                    <div class="momo-checkbox-item">
                        <input type="checkbox" id="${entryId}" value="${entry.uid}">
                        <label for="${entryId}">${escapeHtml(
                    displayName
                )}</label>
                    </div>
                `);
                momoSourceEntriesContainer.append(entryElement);
            });
        } catch (error) {
            console.error(`[${extensionName}] 加载源条目失败:`, error);
            toastr.error("加载源世界书的条目失败。");
            momoSourceEntriesContainer.html(
                '<p style="color:red;">加载条目失败！</p>'
            );
        }
    }

    /**
     * 迁移视图：执行条目迁移
     */
    async function handleTransferEntries() {
        const sourceBook = momoSourceWorldbookSelect.val();
        const targetBook = momoTargetWorldbookSelect.val();
        const selectedEntryUids = momoSourceEntriesContainer
            .find('input[type="checkbox"]:checked')
            .map((_, el) => $(el).val())
            .get();

        // 1. 验证
        if (!sourceBook || !targetBook) {
            toastr.warning("请选择源世界书和目标世界书。");
            return;
        }
        if (sourceBook === targetBook) {
            toastr.warning("源世界书和目标世界书不能是同一个。");
            return;
        }
        if (selectedEntryUids.length === 0) {
            toastr.warning("请至少选择一个要迁移的条目。");
            return;
        }

        momoTransferEntriesBtn.prop("disabled", true).text("迁移中...");

        try {
            // 2. 获取源条目数据
            const allSourceEntries =
                momoSourceEntriesContainer.data("entries") || [];
            const entriesToTransfer = allSourceEntries.filter((entry) =>
                selectedEntryUids.includes(String(entry.uid))
            );

            if (!tavernHelperApi) tavernHelperApi = await waitForTavernHelper();

            // 3. 逐条创建到目标世界书
            for (const entry of entriesToTransfer) {
                // 复制条目数据，但不包括 uid，让系统自动生成新的
                const newEntryData = { ...entry };
                delete newEntryData.uid;

                // 调用创建接口
                await createLorebookEntry(targetBook, newEntryData);
            }

            toastr.success(
                `成功将 ${entriesToTransfer.length} 个条目从 "${
                    momoSourceWorldbookSelect.find("option:selected").text()
                }" 迁移到 "${
                    momoTargetWorldbookSelect.find("option:selected").text()
                }"！`
            );

            // 迁移成功后，可以考虑清空选择
            momoSourceEntriesContainer
                .find('input[type="checkbox"]:checked')
                .prop("checked", false);
        } catch (error) {
            console.error(`[${extensionName}] 迁移条目失败:`, error);
            toastr.error(`迁移失败: ${error.message}`);
        } finally {
            momoTransferEntriesBtn.prop("disabled", false).text("执行迁移");
        }
    }

    // -----------------------------------------------------------------
    // 6. 初始化流程
    // -----------------------------------------------------------------
    async function initializeExtension() {
        // 1. 动态加载CSS
        $("head").append(
            `<link rel="stylesheet" type="text/css" href="${extensionFolderPath}/style.css">`
        );

        // 2. 加载 HTML
        try {
            const [settingsHtml, popupHtml] = await Promise.all([
                $.get(`${extensionFolderPath}/settings.html`),
                $.get(`${extensionFolderPath}/popup.html`),
            ]);
            $("#extensions_settings2").append(settingsHtml);
            $("body").append(popupHtml);
        } catch (error) {
            console.error(
                `[${extensionName}] Failed to load HTML files.`,
                error
            );
            return; // 无法加载HTML，中止初始化
        }

        // 2. 获取 DOM 引用
        // -- 主要视图
        mainView = $("#momo-main-view");
        selectView = $("#momo-select-view");
        modifyView = $("#momo-modify-view");
        generatorView = $("#momo-generator-view");
        designerView = $("#momo-designer-view");
        deleteView = $("#momo-delete-view");
        transferView = $("#momo-transfer-view"); // 新增
        bookList = $("#momo-book-list");
        presetListContainer = $("#momo-preset-list-container");
        overlay = $(`#${OVERLAY_ID}`);

        // -- 全局区按钮
        selectBookBtn = $("#momo-select-book-btn");
        loadPresetBtn = $("#momo-load-preset-btn");
        savePresetBtn = $("#momo-save-preset-btn");

        // -- 编辑区控件
        editWorldbookSelect = $("#momo-edit-worldbook-select");
        editActionsContainer = $("#momo-edit-actions-container");
        gotoModifyBtn = $("#momo-goto-modify-btn");
        gotoDeleteBtn = $("#momo-goto-delete-btn");
        gotoGeneratorBtn = $("#momo-goto-generator-btn");
        gotoDesignerBtn = $("#momo-goto-designer-btn");
        gotoTransferBtn = $("#momo-goto-transfer-btn"); // 新增

        // -- "修改条目"子页面控件
        momoWorldbookSelect = $("#momo-worldbook-select");
        momoEntrySelect = $("#momo-entry-select");
        momoUserPrompt = $("#momo-user-prompt");
        momoAiResponse = $("#momo-ai-response");
        momoSubmitModificationBtn = $("#momo-submit-modification-btn");
        momoSelectedEntryContent = $("#momo-selected-entry-content");
        momoSaveManualChangesBtn = $("#momo-save-manual-changes-btn");

        // -- "世界生成器"子页面控件
        momoGeneratorPrompt = $("#momo-generator-prompt");
        momoGeneratorResponse = $("#momo-generator-response");
        momoSubmitGeneratorBtn = $("#momo-submit-generator-btn");
        momoUploadGeneratorBtn = $("#momo-upload-generator-btn");

        // -- "故事设计师"子页面控件
        momoDesignerPrompt = $("#momo-designer-prompt");
        momoDesignerResponse = $("#momo-designer-response");
        momoSubmitDesignerBtn = $("#momo-submit-designer-btn");
        momoUploadDesignerBtn = $("#momo-upload-designer-btn");

        // -- "条目迁移"子页面控件
        momoSourceWorldbookSelect = $("#momo-source-worldbook-select");
        momoTargetWorldbookSelect = $("#momo-target-worldbook-select");
        momoSourceEntriesContainer = $("#momo-source-entries-container");
        momoTransferEntriesBtn = $("#momo-transfer-entries-btn");

        // 3. 绑定事件
        // -- 弹窗控制
        // 修复移动端关闭按钮可能不触发 click 事件的问题，同时绑定 'click' 和 'touchend'
        $(`#${CLOSE_BUTTON_ID}`).on("click touchend", closePopup);
        overlay.on("click", function (event) {
            if (event.target === this) closePopup();
        });
        $(`#${POPUP_ID}`).on("click", (e) => e.stopPropagation());

        // -- 主视图 > 全局区
        selectBookBtn.on("click", () => showSubView("momo-select-view"));
        loadPresetBtn.on("click", () => presetListContainer.slideToggle());

        // -- 主视图 > 编辑区
        editWorldbookSelect.on("change", function () {
            const isBookSelected = !!$(this).val();
            editActionsContainer.toggleClass("momo-disabled", !isBookSelected);
            editActionsContainer
                .find("button")
                .prop("disabled", !isBookSelected);
        });

        // -- 删除视图相关
        worldbookListContainer = $("#worldbook-list-container");
        deleteWorldbookBtn = $("#delete-worldbook-btn");
        constantEntriesContainer = $("#constant-entries-container");
        normalEntriesContainer = $("#normal-entries-container");
        deleteEntryBtn = $("#delete-entry-btn");

        // -- 各子页面的返回按钮 (使用事件委托)
        $(".momo-popup-body").on(
            "click",
            ".momo-back-to-main-btn",
            showMainView
        );

        // -- "选择世界书(全局)" 子页面的保存按钮
        savePresetBtn.on("click", async () => {
            const presetName = prompt("请输入方案名称：");
            if (!presetName || presetName.trim() === "") {
                alert("名称不能为空！");
                return;
            }
            const selectedBooks = $(".momo-book-button.selected")
                .map((_, el) => $(el).data("book-filename"))
                .get();
            if (selectedBooks.length === 0) {
                alert("请至少选择一个世界书！");
                return;
            }
            savePreset({ name: presetName, books: selectedBooks });
            alert(`方案 "${presetName}" 已保存！`);
            showMainView();
        });

        // -- 功能按钮导航到各子页面
        gotoModifyBtn.on("click", () => showSubView("momo-modify-view"));
        gotoDeleteBtn.on("click", () => {
            showSubView("momo-delete-view");
            renderDeleteView(); // 渲染删除页面
        });
        gotoGeneratorBtn.on("click", () => showSubView("momo-generator-view"));
        gotoDesignerBtn.on("click", () => showSubView("momo-designer-view"));
        gotoTransferBtn.on("click", () => showSubView("momo-transfer-view")); // 新增

        // -- "修改条目" 子页面的事件绑定
        momoWorldbookSelect.on("change", populateEntrySelect);
        momoEntrySelect.on("change", handleEntrySelectionChange);
        momoSubmitModificationBtn.on("click", handleSubmitModification);
        momoSaveManualChangesBtn.on("click", handleManualSave);

        // -- "条目迁移" 子页面的事件绑定
        momoSourceWorldbookSelect.on("change", renderSourceEntries);
        momoTransferEntriesBtn.on("click", handleTransferEntries);

        // -- 删除视图的事件绑定
        deleteWorldbookBtn.on("click", handleDeleteWorldbooks);
        deleteEntryBtn.on("click", handleDeleteEntries);

        // -- "世界生成器" 子页面的事件绑定
        momoSubmitGeneratorBtn.on("click", handleGenerateWorld);
        momoUploadGeneratorBtn.on("click", handleUploadWorld);

        // -- "故事设计师" 子页面的事件绑定
        momoSubmitDesignerBtn.on("click", handleGenerateStory);
        momoUploadDesignerBtn.on("click", handleUploadStory);

        // -- 浮动按钮开关
        const isEnabled = localStorage.getItem(STORAGE_KEY_ENABLED) !== "false";
        $(TOGGLE_ID).prop("checked", isEnabled);
        $(document).on("change", TOGGLE_ID, function () {
            localStorage.setItem(STORAGE_KEY_ENABLED, $(this).is(":checked"));
            $(this).is(":checked")
                ? initializeFloatingButton()
                : destroyFloatingButton();
        });

        // 4. 初始状态
        if (isEnabled) {
            initializeFloatingButton();
        }
        await populateEditWorldbookSelect(); // 填充主界面的下拉菜单
        showMainView(); // 默认显示主视图

        // 绑定设置面板中的更新按钮事件
        $("#momo-check-update-button").on("click", () =>
            Updater.checkForUpdates(true)
        );
        // 页面加载时静默检查更新
        Updater.checkForUpdates(false);
    }

    // 运行初始化
    try {
        await initializeExtension();
        console.log(`[${extensionName}] 扩展已恢复并完全加载。`);
    } catch (error) {
        console.error(`[${extensionName}] 扩展初始化失败:`, error);
        alert(`扩展 "${extensionName}" 初始化失败: ${error.message}`);
    }
});
