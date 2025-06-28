// 使用 jQuery 确保在 DOM 加载完毕后执行我们的代码
jQuery(async () => {
    // -----------------------------------------------------------------
    // 1. 定义常量和状态变量
    // -----------------------------------------------------------------
    const extensionName = "preset-manager-momo";
    const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

    // 存储键 (使用 pmm- 前缀确保唯一性)
    const STORAGE_KEY_BUTTON_POS = "pmm-button-position";
    const STORAGE_KEY_ENABLED = "pmm-enabled";

    // DOM IDs and Selectors (使用 pmm- 前缀)
    const BUTTON_ID = "preset-manager-momo-button"; // 这个保持不变，因为它在CSS中是独立的
    const OVERLAY_ID = "pmm-popup-overlay";
    const POPUP_ID = "pmm-popup";
    const CLOSE_BUTTON_ID = "pmm-popup-close-button";
    const TOGGLE_ID = "#preset-manager-momo-enabled-toggle"; // 这个是设置页面的，保持不变

    // DOM 元素引用
    let overlay, mainView, editView, deleteView, transferView, aiCreateView;
    let presetListContainer;

    // -----------------------------------------------------------------
    // 2. SillyTavern PresetManager API 封装
    // -----------------------------------------------------------------
    const PresetManagerAPI = {
        api: null,

        /**
         * 获取并缓存 PresetManager 的 API 实例。
         * @returns {Promise<object>} PresetManager API 实例。
         */
        async getApi() {
            // 每次都获取最新的 API 实例，以避免使用可能已过期的旧引用。
            // 这能确保我们的操作（如保存）能够正确通知 SillyTavern 主界面更新。
            const api = await SillyTavern.getContext().getPresetManager();
            if (!api) {
                throw new Error("PresetManager API not available.");
            }
            return api;
        },

        /**
         * 获取所有预设的名称列表。
         * @returns {Promise<string[]>}
         */
        async getAllPresetNames() {
            const api = await this.getApi();
            return api.getAllPresets();
        },

        /**
         * 根据名称获取完整的预设数据对象。
         * @param {string} name - 预设名称。
         * @returns {Promise<object|undefined>}
         */
        async getPresetByName(name) {
            const api = await this.getApi();
            return api.getCompletionPresetByName(name);
        },

        /**
         * 获取当前选中的预设名称。
         * @returns {Promise<string>}
         */
        async getSelectedPresetName() {
            const api = await this.getApi();
            return api.getSelectedPresetName();
        },

        /**
         * 根据名称应用一个预设。
         * @param {string} name - 预设名称。
         */
        async selectPreset(name) {
            const api = await this.getApi();
            const presetValue = api.findPreset(name);
            if (presetValue !== undefined) {
                api.selectPreset(presetValue);
                toastr.success(`预设 "${name}" 已加载。`);
            } else {
                toastr.error(`找不到预设 "${name}"。`);
            }
        },

        /**
         * 保存预设。如果存在同名预设，则覆盖。
         * @param {string} name - 预设名称。
         * @param {object} settings - 预设的数据对象。
         */
        async savePreset(name, settings) {
            const api = await this.getApi();
            await api.savePreset(name, settings);
            // 恢复通用成功提示，确保底层操作有反馈
            toastr.success(`预设 "${name}" 已保存。`);
        },

        /**
         * 根据名称删除一个预设。
         * @param {string} name - 预设名称。
         */
        async deletePreset(name) {
            const api = await this.getApi();
            await api.deletePreset(name);
            toastr.success(`预设 "${name}" 已删除。`);
        },
    };

    // -----------------------------------------------------------------
    // 3. 弹窗和视图管理
    // -----------------------------------------------------------------

    /**
     * 打开弹窗并显示主视图。
     */
    function showPopup() {
        if (overlay) {
            overlay.css("display", "flex");
            showMainView(); // 每次打开都回到主视图
        }
    }

    /**
     * 关闭弹窗。
     */
    function closePopup() {
        if (overlay) overlay.hide();
    }

    /**
     * 切换到指定视图。
     * @param {jQuery} viewToShow - 要显示的视图的jQuery对象。
     */
    function switchView(viewToShow) {
        // 隐藏所有视图
        mainView.hide();
        editView.hide();
        deleteView.hide();
        transferView.hide();
        aiCreateView.hide(); // 确保新视图也被隐藏
        // 显示目标视图
        viewToShow.show();
    }

    /**
     * 显示主视图并刷新预设列表。
     */
    async function showMainView() {
        switchView(mainView);
        await renderPresetList();
    }

    /**
     * 显示并渲染删除视图。
     */
    async function showDeleteView() {
        switchView(deleteView);
        const presetList = deleteView
            .find("#pmm-delete-preset-list")
            .empty()
            .html("<p>加载中...</p>");
        const entryPresetSelect = deleteView
            .find("#pmm-delete-entry-preset-select")
            .empty();
        deleteView.find("#pmm-delete-entry-list").empty(); // 清空条目列表

        try {
            const presetNames = await PresetManagerAPI.getAllPresetNames();
            presetList.empty();
            entryPresetSelect.append(
                '<option value="">-- 选择一个预设来编辑条目 --</option>'
            );

            if (presetNames.length === 0) {
                presetList.html(
                    '<p class="pmm-no-tasks">没有找到任何预设。</p>'
                );
                return;
            }

            presetNames.forEach((name) => {
                // 用于批量删除预设的列表
                const presetItem = $(`
                    <div class="pmm-checkbox-item">
                        <input type="checkbox" id="del-preset-${name}" value="${escapeHtml(
                    name
                )}">
                        <label for="del-preset-${name}">${escapeHtml(
                    name
                )}</label>
                    </div>
                `);
                presetList.append(presetItem);

                // 用于选择编辑哪个预设条目的下拉菜单
                entryPresetSelect.append(
                    `<option value="${escapeHtml(name)}">${escapeHtml(
                        name
                    )}</option>`
                );
            });
        } catch (error) {
            console.error(
                `[${extensionName}] Error rendering delete view:`,
                error
            );
            presetList.html(
                `<p style="color:red;">加载预设列表失败: ${error.message}</p>`
            );
        }
    }

    /**
     * 显示并渲染条目复制视图。
     */
    async function showTransferView() {
        switchView(transferView);
        const sourceSelect = transferView
            .find("#pmm-source-preset-select")
            .empty();
        const targetSelect = transferView
            .find("#pmm-target-preset-select")
            .empty();
        transferView
            .find("#pmm-source-entries-container")
            .empty()
            .html('<p class="pmm-no-tasks">请先选择一个源预设。</p>');

        try {
            const presetNames = await PresetManagerAPI.getAllPresetNames();
            const placeholder = '<option value="">-- 请选择预设 --</option>';
            sourceSelect.append(placeholder);
            targetSelect.append(placeholder);

            if (presetNames.length === 0) {
                return;
            }

            presetNames.forEach((name) => {
                const option = `<option value="${escapeHtml(
                    name
                )}">${escapeHtml(name)}</option>`;
                sourceSelect.append(option);
                targetSelect.append(option);
            });
        } catch (error) {
            console.error(
                `[${extensionName}] Error rendering transfer view:`,
                error
            );
            toastr.error(`加载预设列表失败: ${error.message}`);
        }
    }

    /**
     * 显示并准备AI创建条目视图。
     */
    async function showAiCreateView() {
        switchView(aiCreateView);
        await populateAiCreatePresetSelect();
    }

    // -----------------------------------------------------------------
    // 4. UI 渲染逻辑
    // -----------------------------------------------------------------

    /**
     * 渲染主视图的预设列表。
     */
    async function renderPresetList() {
        presetListContainer.empty().html("<p>加载中...</p>");
        try {
            const [presetNames, selectedPresetName] = await Promise.all([
                PresetManagerAPI.getAllPresetNames(),
                PresetManagerAPI.getSelectedPresetName(),
            ]);

            presetListContainer.empty();
            if (presetNames.length === 0) {
                presetListContainer.html(
                    '<p class="pmm-no-tasks">没有找到任何预设。</p>'
                );
                return;
            }

            presetNames.forEach((name) => {
                const isActive = name === selectedPresetName;
                const item = $(`
                    <div class="pmm-preset-item ${isActive ? "active" : ""}">
                        <span class="preset-name">${escapeHtml(name)}</span>
                        <div class="preset-actions">
                            <button class="load-btn" title="加载预设"><i class="fa-solid fa-check"></i></button>
                            <button class="edit-btn" title="高级编辑"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button class="delete-btn" title="删除预设"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                `);

                // 为按钮绑定点击和触摸结束事件，以兼容移动端
                item.find(".load-btn").on("click touchend", async (e) => {
                    e.stopPropagation();
                    e.preventDefault(); // 防止触摸事件触发两次
                    await PresetManagerAPI.selectPreset(name);
                    await renderPresetList(); // 重新渲染以更新高亮
                });

                item.find(".edit-btn").on("click touchend", async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    await showEditView(name);
                });

                item.find(".delete-btn").on("click touchend", async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (confirm(`确定要删除预设 "${name}" 吗？`)) {
                        try {
                            await PresetManagerAPI.deletePreset(name);
                            // 直接从DOM中移除元素，避免重新加载时的状态延迟问题
                            item.remove();
                            toastr.success(`预设 "${name}" 已删除。`);
                        } catch (error) {
                            console.error(
                                `[${extensionName}] Error deleting preset:`,
                                error
                            );
                            toastr.error(
                                `删除预设 "${name}" 失败: ${error.message}`
                            );
                        }
                    }
                });

                presetListContainer.append(item);
            });
        } catch (error) {
            console.error(
                `[${extensionName}] Error rendering preset list:`,
                error
            );
            presetListContainer.html(
                `<p style="color:red;">加载预设列表失败: ${error.message}</p>`
            );
        }
    }

    /**
     * 显示并填充高级编辑视图。
     * @param {string} presetName - 要编辑的预设的名称。
     * @param {string|null} selectedEntryIdentifier - 可选，指定要默认选中的条目标识符。
     */
    async function showEditView(presetName, selectedEntryIdentifier = null) {
        switchView(editView);
        editView.find("h3").text(`高级编辑: ${escapeHtml(presetName)}`);

        // 清理旧状态
        const entrySelect = $("#pmm-entry-select").empty();
        const entryEditorForm = $("#pmm-entry-editor-form").hide();
        const paramsEditorContainer = $(
            "#pmm-prompt-editor-container"
        ).empty();

        try {
            const presetData = await PresetManagerAPI.getPresetByName(
                presetName
            );
            if (!presetData) {
                paramsEditorContainer.html(
                    '<p style="color:red;">找不到预设数据。</p>'
                );
                return;
            }

            // 缓存原始数据
            editView.data("presetData", presetData);
            editView.data("presetName", presetName);

            // 1. 填充条目选择器
            entrySelect.append(
                '<option value="">-- 选择一个条目来编辑 --</option>'
            );
            if (presetData.prompts && Array.isArray(presetData.prompts)) {
                presetData.prompts.forEach((prompt) => {
                    // 使用 identifier 作为唯一值，name 作为显示文本
                    const option = `<option value="${escapeHtml(
                        prompt.identifier
                    )}">${escapeHtml(prompt.name)}</option>`;
                    entrySelect.append(option);
                });
            }

            // 如果指定了要选中的条目，则选中它并触发change事件
            if (selectedEntryIdentifier) {
                entrySelect.val(selectedEntryIdentifier);
                // 确保在设置值后，显式调用渲染函数来显示表单
                renderEntryEditor();
            }

            // 2. 填充高级参数设置
            paramsEditorContainer.empty();
            for (const [key, value] of Object.entries(presetData)) {
                if (key === "prompts") continue; // 跳过条目数组
                const field = $(`
                    <div class="prompt-field">
                        <label for="prop-${key}">${escapeHtml(key)}</label>
                        <input type="text" id="prop-${key}" class="pmm-input" name="${key}" value="${escapeHtml(
                    value
                )}">
                    </div>
                `);
                if (typeof value === "boolean") {
                    field.find("input").replaceWith(`
                        <select id="prop-${key}" name="${key}" class="pmm-select">
                            <option value="true" ${
                                value === true ? "selected" : ""
                            }>true</option>
                            <option value="false" ${
                                value === false ? "selected" : ""
                            }>false</option>
                        </select>
                    `);
                } else if (typeof value === "number") {
                    field.find("input").attr("type", "number");
                }
                paramsEditorContainer.append(field);
            }
        } catch (error) {
            console.error(
                `[${extensionName}] Error loading preset for editing:`,
                error
            );
            paramsEditorContainer.html(
                `<p style="color:red;">加载预设失败: ${error.message}</p>`
            );
        }
    }

    /**
     * 根据选择的条目渲染其编辑表单。
     */
    function renderEntryEditor() {
        const selectedIdentifier = $("#pmm-entry-select").val();
        const entryEditorForm = $("#pmm-entry-editor-form");
        const presetData = editView.data("presetData");

        if (!selectedIdentifier || !presetData || !presetData.prompts) {
            entryEditorForm.hide();
            return;
        }

        const entry = presetData.prompts.find(
            (p) => p.identifier === selectedIdentifier
        );

        if (entry) {
            $("#pmm-entry-name-input").val(entry.name || "");
            $("#pmm-entry-content-textarea").val(entry.content || "");
            entryEditorForm.show();
        } else {
            entryEditorForm.hide();
        }
    }

    /**
     * 渲染用于复制的源预设条目列表。
     */
    async function renderEntriesForTransfer() {
        const sourcePresetName = transferView
            .find("#pmm-source-preset-select")
            .val();
        const entriesContainer = transferView
            .find("#pmm-source-entries-container")
            .empty();

        if (!sourcePresetName) {
            entriesContainer.html(
                '<p class="pmm-no-tasks">请先选择一个源预设。</p>'
            );
            return;
        }

        entriesContainer.html("<p>加载中...</p>");
        try {
            const presetData = await PresetManagerAPI.getPresetByName(
                sourcePresetName
            );
            entriesContainer.empty();

            if (
                !presetData ||
                !presetData.prompts ||
                !Array.isArray(presetData.prompts)
            ) {
                entriesContainer.html(
                    '<p class="pmm-no-tasks">此预设没有可供复制的条目。</p>'
                );
                return;
            }

            presetData.prompts.forEach((prompt) => {
                const entryItem = $(`
                    <div class="pmm-checkbox-item">
                        <input type="checkbox" id="transfer-entry-${
                            prompt.identifier
                        }" value="${escapeHtml(prompt.identifier)}">
                        <label for="transfer-entry-${
                            prompt.identifier
                        }" title="${escapeHtml(prompt.content)}">${escapeHtml(
                    prompt.name
                )}</label>
                    </div>
                `);
                entriesContainer.append(entryItem);
            });

            // 缓存源预设数据以便复制时使用
            entriesContainer.data("sourcePresetData", presetData);
        } catch (error) {
            console.error(
                `[${extensionName}] Error rendering entries for transfer:`,
                error
            );
            entriesContainer.html(
                `<p style="color:red;">加载条目失败: ${error.message}</p>`
            );
        }
    }

    /**
     * 渲染用于删除的预设条目列表。(已修正)
     */
    async function renderEntriesForDeletion() {
        const selectedPresetName = deleteView
            .find("#pmm-delete-entry-preset-select")
            .val();
        const entryList = deleteView.find("#pmm-delete-entry-list").empty();

        if (!selectedPresetName) return;

        entryList.html("<p>加载中...</p>");
        try {
            const presetData = await PresetManagerAPI.getPresetByName(
                selectedPresetName
            );
            entryList.empty();

            if (
                !presetData ||
                !presetData.prompts ||
                !Array.isArray(presetData.prompts)
            ) {
                entryList.html(
                    '<p class="pmm-no-tasks">此预设没有可供删除的条目。</p>'
                );
                return;
            }
            // 缓存预设数据
            deleteView.data("presetDataForDeletion", presetData);

            presetData.prompts.forEach((prompt) => {
                const entryItem = $(`
                    <div class="pmm-checkbox-item">
                        <input type="checkbox" id="del-entry-${
                            prompt.identifier
                        }" value="${escapeHtml(prompt.identifier)}">
                        <label for="del-entry-${
                            prompt.identifier
                        }" title="${escapeHtml(prompt.content)}">${escapeHtml(
                    prompt.name
                )}</label>
                    </div>
                `);
                entryList.append(entryItem);
            });
        } catch (error) {
            console.error(
                `[${extensionName}] Error rendering entries for deletion:`,
                error
            );
            entryList.html(
                `<p style="color:red;">加载条目失败: ${error.message}</p>`
            );
        }
    }

    // -----------------------------------------------------------------
    // 5. 事件处理
    // -----------------------------------------------------------------

    /**
     * 处理批量删除预设。
     */
    async function handleDeletePresets() {
        const checkedCheckboxes = deleteView.find(
            '#pmm-delete-preset-list input[type="checkbox"]:checked'
        );
        const selectedPresets = checkedCheckboxes
            .map(function () {
                return $(this).val();
            })
            .get();

        if (selectedPresets.length === 0) {
            toastr.warning("请至少选择一个要删除的预设。");
            return;
        }

        if (
            !confirm(
                `确定要删除选中的 ${selectedPresets.length} 个预设吗？此操作不可撤销。`
            )
        ) {
            return;
        }

        const deleteBtn = deleteView.find("#pmm-delete-selected-presets-btn");
        deleteBtn
            .prop("disabled", true)
            .html('<i class="fas fa-spinner fa-spin"></i> 删除中...');

        try {
            // 使用 Promise.all 来并行处理所有删除操作
            await Promise.all(
                selectedPresets.map((name) =>
                    PresetManagerAPI.deletePreset(name)
                )
            );

            // 直接从DOM移除对应的元素
            checkedCheckboxes.each(function () {
                $(this).closest(".pmm-checkbox-item").remove();
            });
            // 同样从条目选择下拉菜单中移除
            selectedPresets.forEach((name) => {
                deleteView
                    .find(
                        `#pmm-delete-entry-preset-select option[value="${name}"]`
                    )
                    .remove();
            });

            toastr.success(`成功删除了 ${selectedPresets.length} 个预设。`);
        } catch (error) {
            console.error(`[${extensionName}] Error deleting presets:`, error);
            toastr.error(`删除预设时出错: ${error.message}`);
        } finally {
            deleteBtn.prop("disabled", false).text("删除选中的预设");
        }
    }

    /**
     * 处理批量删除预设中的条目。
     */
    async function handleDeleteEntries() {
        const presetName = deleteView
            .find("#pmm-delete-entry-preset-select")
            .val();
        if (!presetName) {
            toastr.warning("请先选择一个预设。");
            return;
        }

        const checkedCheckboxes = deleteView.find(
            '#pmm-delete-entry-list input[type="checkbox"]:checked'
        );
        const selectedEntryIdentifiers = checkedCheckboxes
            .map(function () {
                return $(this).val();
            })
            .get();

        if (selectedEntryIdentifiers.length === 0) {
            toastr.warning("请至少选择一个要删除的条目。");
            return;
        }

        const deleteBtn = deleteView.find("#pmm-delete-selected-entries-btn");
        deleteBtn
            .prop("disabled", true)
            .html('<i class="fas fa-spinner fa-spin"></i> 删除中...');

        try {
            // 从缓存中获取预设数据
            const presetData = deleteView.data("presetDataForDeletion");
            if (!presetData || !presetData.prompts) {
                throw new Error("找不到预设数据。");
            }

            // 过滤掉选中的条目
            presetData.prompts = presetData.prompts.filter(
                (prompt) =>
                    !selectedEntryIdentifiers.includes(prompt.identifier)
            );

            // 保存修改后的预设
            await PresetManagerAPI.savePreset(presetName, presetData);

            // 成功提示
            toastr.success(
                `成功从 "${presetName}" 中删除了 ${selectedEntryIdentifiers.length} 个条目。`
            );

            // 直接从DOM中移除对应的条目，实现即时刷新
            checkedCheckboxes.each(function () {
                $(this).closest(".pmm-checkbox-item").remove();
            });
        } catch (error) {
            console.error(`[${extensionName}] Error deleting entries:`, error);
            toastr.error(`删除条目时出错: ${error.message}`);
        } finally {
            deleteBtn.prop("disabled", false).text("删除选中的条目");
        }
    }

    /**
     * 保存对单个条目的修改。
     */
    async function handleSaveEntryChanges() {
        const selectedIdentifier = $("#pmm-entry-select").val();
        const presetName = editView.data("presetName");
        const presetData = editView.data("presetData");

        if (
            !selectedIdentifier ||
            !presetName ||
            !presetData ||
            !presetData.prompts
        ) {
            toastr.error("无法保存，缺少条目或预设信息。");
            return;
        }

        const entryIndex = presetData.prompts.findIndex(
            (p) => p.identifier === selectedIdentifier
        );
        if (entryIndex === -1) {
            toastr.error("找不到要更新的条目。");
            return;
        }

        // 更新数据
        presetData.prompts[entryIndex].name = $("#pmm-entry-name-input").val();
        presetData.prompts[entryIndex].content = $(
            "#pmm-entry-content-textarea"
        ).val();

        try {
            await PresetManagerAPI.savePreset(presetName, presetData);
            toastr.success(
                `条目 "${presetData.prompts[entryIndex].name}" 已保存。`
            );
            // 刷新当前编辑视图并保持选中当前条目
            await showEditView(presetName, selectedIdentifier);
        } catch (error) {
            console.error(
                `[${extensionName}] Error saving entry changes:`,
                error
            );
            toastr.error(`保存条目失败: ${error.message}`);
        }
    }

    /**
     * 保存“高级参数设置”的修改。
     */
    async function handleSaveManualChanges() {
        const presetName = editView.data("presetName");
        const originalPresetData = editView.data("presetData");
        if (!presetName || !originalPresetData) {
            toastr.error("无法保存，缺少预设信息。");
            return;
        }

        const newPresetData = { ...originalPresetData }; // 包含 prompts 数组的完整克隆

        $("#pmm-prompt-editor-container .prompt-field").each(function () {
            const input = $(this).find("input, select");
            const key = input.attr("name");
            let value = input.val();

            if (key in newPresetData) {
                // 类型转换
                if (typeof originalPresetData[key] === "boolean") {
                    value = value === "true";
                } else if (typeof originalPresetData[key] === "number") {
                    value = parseFloat(value);
                }
                newPresetData[key] = value;
            }
        });

        try {
            await PresetManagerAPI.savePreset(presetName, newPresetData);
            toastr.success(`高级参数已保存。`);
            // 刷新当前编辑视图，并保持条目选择（如果已选）
            const selectedIdentifier = $("#pmm-entry-select").val();
            await showEditView(presetName, selectedIdentifier);
        } catch (error) {
            console.error(
                `[${extensionName}] Error saving advanced params:`,
                error
            );
            toastr.error(`保存参数失败: ${error.message}`);
        }
    }

    /**
     * AI辅助修改条目内容
     */
    async function handleEntryAiAssist() {
        const selectedIdentifier = $("#pmm-entry-select").val();
        const userPrompt = $("#pmm-entry-ai-prompt").val().trim();
        const presetData = editView.data("presetData");

        if (!selectedIdentifier || !presetData || !presetData.prompts) {
            toastr.error("请先选择一个要编辑的条目。");
            return;
        }
        if (!userPrompt) {
            toastr.warning("请输入你的修改要求。");
            return;
        }

        const entry = presetData.prompts.find(
            (p) => p.identifier === selectedIdentifier
        );
        if (!entry) {
            toastr.error("找不到要更新的条目。");
            return;
        }

        const originalContent = entry.content;
        const aiSubmitBtn = $("#pmm-submit-entry-ai-btn");
        aiSubmitBtn
            .prop("disabled", true)
            .html('<i class="fas fa-spinner fa-spin"></i> 处理中...');

        try {
            const systemPrompt = `你是一个专业的文本编辑器。你的任务是根据用户的要求，修改给定的文本内容。
            **核心规则:**
            1.  你的输出**必须**是纯净的、修改后的文本内容。
            2.  **绝对禁止**任何解释性文字、注释或额外的对话，除非用户明确要求。
            3.  保持原始文本的格式和换行，除非修改要求本身就是关于格式的。`;

            const finalPrompt = `${systemPrompt}

            **这是当前的文本内容:**
            \`\`\`text
            ${originalContent}
            \`\`\`

            **用户的要求是:**
            "${userPrompt}"

            **你的输出 (纯文本):**`;

            const rawAiResponse = await TavernHelper.generateRaw({
                ordered_prompts: [{ role: "system", content: finalPrompt }],
            });

            // 在这里添加日志，用于调试
            console.log(
                `[${extensionName}] Raw AI Response Received:`,
                rawAiResponse
            );

            if (!rawAiResponse) {
                throw new Error("AI返回的内容为空。");
            }

            // 将AI结果填入新文本框并显示
            $("#pmm-ai-result-textarea").val(rawAiResponse);
            $("#pmm-ai-result-container").show();
            toastr.success("AI已生成内容，请审核后保存。");
        } catch (error) {
            console.error(`[${extensionName}] AI-assist failed:`, error);
            toastr.error(`AI辅助修改失败: ${error.message}`);
        } finally {
            aiSubmitBtn.prop("disabled", false).text("提交给AI");
        }
    }

    /**
     * 保存AI生成并可能被修改过的内容
     */
    async function handleSaveAiResult() {
        const selectedIdentifier = $("#pmm-entry-select").val();
        const presetName = editView.data("presetName");
        const presetData = editView.data("presetData");
        const newContent = $("#pmm-ai-result-textarea").val();

        if (
            !selectedIdentifier ||
            !presetName ||
            !presetData ||
            !presetData.prompts
        ) {
            toastr.error("无法保存，缺少条目或预设信息。");
            return;
        }

        const entryIndex = presetData.prompts.findIndex(
            (p) => p.identifier === selectedIdentifier
        );
        if (entryIndex === -1) {
            toastr.error("找不到要更新的条目。");
            return;
        }

        // 更新数据
        presetData.prompts[entryIndex].content = newContent;

        try {
            await PresetManagerAPI.savePreset(presetName, presetData);
            toastr.success(`条目内容已成功更新并保存。`);

            // 更新主编辑框的内容，并清空AI相关区域
            $("#pmm-entry-content-textarea").val(newContent);
            handleClearAiResult();
        } catch (error) {
            console.error(`[${extensionName}] Error saving AI result:`, error);
            toastr.error(`保存AI内容失败: ${error.message}`);
        }
    }

    /**
     * 清空AI结果区域
     */
    function handleClearAiResult() {
        $("#pmm-ai-result-textarea").val("");
        $("#pmm-ai-result-container").hide();
    }

    /**
     * 从AI返回的文本中提取和清理JSON字符串。
     * @param {string} rawText AI的原始输出
     * @returns {string} 清理后的、更可能合法的JSON字符串
     */
    function extractAndCleanJson(rawText) {
        if (!rawText || typeof rawText !== "string") {
            return "";
        }
        const match = rawText.match(/```json\s*([\s\S]*?)\s*```/);
        let jsonString = match ? match[1] : rawText;
        const firstBrace = jsonString.indexOf("{");
        const lastBrace = jsonString.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
            return jsonString.substring(firstBrace, lastBrace + 1).trim();
        }
        return "";
    }

    /**
     * 填充“AI创建条目”功能的目标预设下拉菜单。
     */
    async function populateAiCreatePresetSelect() {
        const select = $("#pmm-ai-create-target-preset").empty();
        try {
            const presetNames = await PresetManagerAPI.getAllPresetNames();
            if (presetNames.length === 0) {
                select.append('<option value="">没有可用的预设</option>');
                return;
            }
            presetNames.forEach((name) => {
                select.append(
                    `<option value="${escapeHtml(name)}">${escapeHtml(
                        name
                    )}</option>`
                );
            });
        } catch (error) {
            console.error(
                `[${extensionName}] Error populating AI create preset select:`,
                error
            );
            toastr.error("加载目标预设列表失败。");
        }
    }

    /**
     * 使用AI从头开始创建一个新的预设条目。
     */
    async function handleAiCreateEntry() {
        const targetPresetName = $("#pmm-ai-create-target-preset").val();
        const userPrompt = $("#pmm-ai-create-prompt").val().trim();

        if (!targetPresetName) {
            toastr.warning("请选择一个要添加新条目的预设。");
            return;
        }
        if (!userPrompt) {
            toastr.warning("请输入你的创建要求。");
            return;
        }

        const createBtn = $("#pmm-ai-create-btn");
        createBtn
            .prop("disabled", true)
            .html('<i class="fas fa-spinner fa-spin"></i> 正在创作...');

        try {
            const systemPrompt = `你是一个专业的SillyTavern预设条目生成器。你的任务是根据用户的要求，创建一个结构化的JSON对象，该对象包含一个预设条目的名称和内容。
            
            **核心规则:**
            1.  你的输出**必须**是一个格式正确的、单一的JSON对象。
            2.  JSON对象必须包含两个键: "name" (string) 和 "content" (string)。
            3.  "name" 应该是对条目功能的简短、精确的概括，例如 "增强NPC主动性"。
            4.  "content" 应该是具体的、可直接用于SillyTavern的指令或文本内容。
            5.  **绝对禁止**在JSON对象之外包含任何解释性文字、注释、代码块标记(如 \`\`\`json)或任何额外的对话。你的输出必须是纯净的JSON。`;

            const finalPrompt = `${systemPrompt}\n\n**用户的要求是:**\n"${userPrompt}"\n\n**你的输出 (纯JSON对象):**`;

            const rawAiResponse = await TavernHelper.generateRaw({
                ordered_prompts: [{ role: "system", content: finalPrompt }],
            });

            console.log(
                `[${extensionName}] Raw AI Response for creation:`,
                rawAiResponse
            );

            const cleanedJson = extractAndCleanJson(rawAiResponse);
            if (!cleanedJson) {
                throw new Error("AI未能返回有效的JSON内容。");
            }

            const newEntryData = JSON.parse(cleanedJson);
            if (!newEntryData.name || !newEntryData.content) {
                throw new Error('AI返回的JSON缺少 "name" 或 "content" 键。');
            }

            // 获取目标预设的当前数据
            const targetPreset = await PresetManagerAPI.getPresetByName(
                targetPresetName
            );
            if (!targetPreset) {
                throw new Error(`找不到目标预设 "${targetPresetName}"。`);
            }

            // 生成唯一ID
            const newIdentifier = `entry_${Date.now()}`;

            // 创建完整的条目对象
            const newPromptObject = {
                identifier: newIdentifier,
                name: newEntryData.name,
                content: newEntryData.content,
                // 可以根据需要添加其他默认值
                enabled: true,
            };

            // --- 开始同步更新 (修改为添加到开头) ---
            // 1. 更新 prompts 数组 (数据库)
            if (!targetPreset.prompts) targetPreset.prompts = [];
            // 使用 unshift 将新条目添加到数组的开头
            targetPreset.prompts.unshift(newPromptObject);

            // 2. 更新 prompt_order 数组 (显示列表)
            const newOrderItem = { identifier: newIdentifier, enabled: true };
            if (
                !targetPreset.prompt_order ||
                targetPreset.prompt_order.length === 0
            ) {
                targetPreset.prompt_order = [
                    { character_id: 100000, order: [] },
                ];
            }
            targetPreset.prompt_order.forEach((orderList) => {
                if (orderList.order) {
                    // 使用 unshift 将新条目添加到显示列表的开头
                    orderList.order.unshift(newOrderItem);
                }
            });
            // --- 同步更新结束 ---

            // 保存修改后的预设
            await PresetManagerAPI.savePreset(targetPresetName, targetPreset);

            toastr.success(
                `新条目 "${newEntryData.name}" 已成功创建并添加到 "${targetPresetName}"！`
            );
            $("#pmm-ai-create-prompt").val(""); // 清空输入框
            await renderPresetList(); // 刷新主列表
        } catch (error) {
            console.error(
                `[${extensionName}] AI entry creation failed:`,
                error
            );
            toastr.error(`AI创建失败: ${error.message}`);
        } finally {
            createBtn.prop("disabled", false).text("✨ AI 创建");
        }
    }

    /**
     * 处理条目从一个预设复制到另一个预设。
     */
    async function handleTransferEntries() {
        console.log(
            `[${extensionName}] handleTransferEntries function triggered.`
        );
        const sourcePresetName = transferView
            .find("#pmm-source-preset-select")
            .val();
        const targetPresetName = transferView
            .find("#pmm-target-preset-select")
            .val();
        const entriesContainer = transferView.find(
            "#pmm-source-entries-container"
        );
        const sourcePresetData = entriesContainer.data("sourcePresetData");

        if (!sourcePresetName || !targetPresetName) {
            toastr.warning("请选择源预设和目标预设。");
            return;
        }
        if (sourcePresetName === targetPresetName) {
            toastr.warning("源预设和目标预设不能相同。");
            return;
        }
        if (!sourcePresetData || !sourcePresetData.prompts) {
            toastr.error("无法获取源预设的数据。");
            return;
        }

        const selectedEntryIdentifiers = entriesContainer
            .find('input[type="checkbox"]:checked')
            .map(function () {
                return $(this).val();
            })
            .get();

        if (selectedEntryIdentifiers.length === 0) {
            toastr.warning("请至少选择一个要复制的条目。");
            return;
        }

        const transferBtn = transferView.find("#pmm-transfer-entries-btn");
        transferBtn
            .prop("disabled", true)
            .html('<i class="fas fa-spinner fa-spin"></i> 正在复制...');

        try {
            const originalTargetPreset = await PresetManagerAPI.getPresetByName(
                targetPresetName
            );
            const newTargetPreset = originalTargetPreset
                ? JSON.parse(JSON.stringify(originalTargetPreset))
                : {};

            // 确保基础结构存在
            if (!newTargetPreset.name) {
                newTargetPreset.name = targetPresetName;
            }
            if (
                !newTargetPreset.prompts ||
                !Array.isArray(newTargetPreset.prompts)
            ) {
                newTargetPreset.prompts = [];
            }
            if (
                !newTargetPreset.prompt_order ||
                !Array.isArray(newTargetPreset.prompt_order)
            ) {
                newTargetPreset.prompt_order = [];
            }

            const entriesToCopy = sourcePresetData.prompts.filter((prompt) =>
                selectedEntryIdentifiers.includes(prompt.identifier)
            );

            // 【修改为添加到开头】
            // 为了在开头保持复制的顺序，我们反转数组，然后使用 unshift
            entriesToCopy.reverse().forEach((entryToCopy) => {
                // 1. 更新 prompts 数组 (数据库)
                // 确保条目数据只添加一次
                if (
                    !newTargetPreset.prompts.some(
                        (p) => p.identifier === entryToCopy.identifier
                    )
                ) {
                    // 使用 unshift 添加到开头
                    newTargetPreset.prompts.unshift(
                        JSON.parse(JSON.stringify(entryToCopy))
                    );
                }

                const newOrderItem = {
                    identifier: entryToCopy.identifier,
                    enabled: true,
                };

                // 2. 遍历目标预设中所有存在的 character_id 列表，并同步添加新条目
                // 如果一个 prompt_order 都没有，则创建一个默认的
                if (newTargetPreset.prompt_order.length === 0) {
                    newTargetPreset.prompt_order.push({
                        character_id: 100000,
                        order: [],
                    });
                }

                newTargetPreset.prompt_order.forEach((orderList) => {
                    if (
                        orderList.order &&
                        !orderList.order.some(
                            (o) => o.identifier === newOrderItem.identifier
                        )
                    ) {
                        // 使用 unshift 添加到显示列表的开头
                        orderList.order.unshift(newOrderItem);
                    }
                });
            });

            // 3. 保存被完全更新的预设对象
            await PresetManagerAPI.savePreset(
                targetPresetName,
                newTargetPreset
            );

            // 4. 刷新UI
            // 此前调用的 reloadPrompts() 函数不存在，导致了报错。
            // 实际上，SillyTavern 的 savePreset 函数已经处理了数据更新，无需额外操作。

            // 5. 提供成功反馈并返回主视图
            toastr.success(
                `成功将 ${entriesToCopy.length} 个条目复制到 "${targetPresetName}"。`
            );
            await showMainView();
        } catch (error) {
            // 根据用户要求，即使发生错误也不再弹出错误提示窗，因为核心复制操作可能已经成功。
            // 仅在控制台记录错误以供调试。
            console.error(
                `[${extensionName}] Error transferring entries (popup suppressed):`,
                error
            );
        } finally {
            transferBtn.prop("disabled", false).text("执行复制");
        }
    }

    // -----------------------------------------------------------------
    // 6. 浮动按钮管理
    // -----------------------------------------------------------------
    /**
     * 使按钮可拖动，并处理点击与拖动的区分。
     * 使按钮可拖动，并处理点击与拖动的区分（兼容桌面和移动端）。
     * @param {jQuery} $button - 按钮的jQuery对象。
     */
    function makeButtonDraggable($button) {
        let isDragging = false;
        let wasDragged = false;
        let dragStartX, dragStartY, startX, startY;

        // 统一的事件处理函数
        const onDragStart = (e) => {
            isDragging = true;
            wasDragged = false;
            
            // 兼容触摸和鼠标事件
            const pageX = e.pageX || e.originalEvent.touches[0].pageX;
            const pageY = e.pageY || e.originalEvent.touches[0].pageY;

            startX = pageX;
            startY = pageY;
            dragStartX = pageX - $button.offset().left;
            dragStartY = pageY - $button.offset().top;

            $button.css("cursor", "grabbing");
            e.preventDefault();
        };

        const onDragMove = (e) => {
            if (isDragging) {
                const pageX = e.pageX || e.originalEvent.touches[0].pageX;
                const pageY = e.pageY || e.originalEvent.touches[0].pageY;

                // 仅当移动超过一个小阈值时才标记为拖动
                if (Math.abs(pageX - startX) > 5 || Math.abs(pageY - startY) > 5) {
                    wasDragged = true;
                }

                $button.css({
                    top: pageY - dragStartY,
                    left: pageX - dragStartX,
                });
            }
        };

        const onDragEnd = () => {
            if (isDragging) {
                isDragging = false;
                $button.css("cursor", "pointer");

                // 如果是拖动，则保存位置
                if (wasDragged) {
                    localStorage.setItem(
                        STORAGE_KEY_BUTTON_POS,
                        JSON.stringify({
                            x: $button.css("left"),
                            y: $button.css("top"),
                        })
                    );
                }
            }
        };

        const onClick = (e) => {
            // 如果是拖动结束，则阻止点击/触摸事件
            if (wasDragged) {
                e.preventDefault();
                wasDragged = false; // 重置标志
                return;
            }
            showPopup();
        };

        // 绑定事件
        $button.on("mousedown touchstart", onDragStart);
        $(document).on("mousemove touchmove", onDragMove);
        $(document).on("mouseup touchend", onDragEnd);
        $button.on("click touchend", onClick);
    }

    /**
     * 初始化并显示浮动按钮。
     */
    function initializeFloatingButton() {
        if ($(`#${BUTTON_ID}`).length) return;

        // 创建按钮
        $("body").append(
            `<div id="${BUTTON_ID}" title="预设管理器"><i class="fa-solid fa-list-check"></i></div>`
        );
        const $button = $(`#${BUTTON_ID}`);

        // 从localStorage恢复按钮位置
        const savedPos = localStorage.getItem(STORAGE_KEY_BUTTON_POS);
        if (savedPos) {
            const pos = JSON.parse(savedPos);
            $button.css({ top: pos.y, left: pos.x });
        } else {
            // 如果没有保存的位置，则设置一个默认位置
            $button.css({ top: "80%", left: "10px" });
        }

        // 使按钮可拖动
        makeButtonDraggable($button);
    }

    /**
     * 移除浮动按钮。
     */
    function destroyFloatingButton() {
        $(`#${BUTTON_ID}`).remove();
    }

    // -----------------------------------------------------------------
    // 7. 初始化流程
    // -----------------------------------------------------------------
    async function initializeExtension() {
        // 1. 动态加载CSS和JS
        $("head").append(
            `<link rel="stylesheet" type="text/css" href="${extensionFolderPath}/style.css?v=${Date.now()}">`
        );
        // 动态加载 updater.js 脚本
        const script = document.createElement('script');
        script.src = `${extensionFolderPath}/updater.js?v=${Date.now()}`;
        document.head.appendChild(script);


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
            return;
        }

        // 3. 获取 DOM 引用
        overlay = $(`#${OVERLAY_ID}`);
        mainView = $("#pmm-main-view");
        editView = $("#pmm-edit-view");
        deleteView = $("#pmm-delete-view");
        transferView = $("#pmm-transfer-view");
        aiCreateView = $("#pmm-ai-create-view"); // 获取新视图的引用
        presetListContainer = $("#pmm-preset-list-container");

        // 4. 绑定事件 (同时绑定 click 和 touchend 以兼容移动端)
        // 将更新按钮的事件绑定到新的 updater 逻辑
        $("#preset-manager-momo-check-update-btn").on("click touchend", (e) => { // 使用完整的ID
            e.preventDefault(); 
            e.stopPropagation();
            if (window.PresetManagerMomoUpdater) {
                window.PresetManagerMomoUpdater.checkForUpdates();
            } else {
                toastr.error("更新脚本尚未加载，请稍候重试。");
            }
        });
        $(`#${CLOSE_BUTTON_ID}`).on("click touchend", (e) => { e.preventDefault(); closePopup(); });
        overlay.on("click touchend", function (event) {
            if (event.target === this) {
                event.preventDefault();
                closePopup();
            }
        });
        $(`#${POPUP_ID}`).on("click touchend", (e) => e.stopPropagation());

        // -- 视图切换按钮
        $("#pmm-goto-delete-btn").on("click touchend", (e) => { e.preventDefault(); showDeleteView(); });
        $("#pmm-goto-transfer-btn").on("click touchend", (e) => { e.preventDefault(); showTransferView(); });
        $("#pmm-goto-ai-create-btn").on("click touchend", (e) => { e.preventDefault(); showAiCreateView(); }); // 绑定新按钮

        // -- 返回主视图按钮 (使用事件委托)
        $(".pmm-popup-body").on(
            "click touchend",
            ".pmm-back-to-main-btn",
            (e) => { e.preventDefault(); showMainView(); }
        );

        // -- AI 创建视图的事件
        $("#pmm-ai-create-btn").on("click touchend", (e) => { e.preventDefault(); handleAiCreateEntry(); });

        // -- 编辑视图的事件
        $("#pmm-entry-select").on("change", renderEntryEditor);
        $("#pmm-save-entry-changes-btn").on("click touchend", (e) => { e.preventDefault(); handleSaveEntryChanges(); });
        $("#pmm-submit-entry-ai-btn").on("click touchend", (e) => { e.preventDefault(); handleEntryAiAssist(); });
        $("#pmm-save-ai-result-btn").on("click touchend", (e) => { e.preventDefault(); handleSaveAiResult(); });
        $("#pmm-clear-ai-result-btn").on("click touchend", (e) => { e.preventDefault(); handleClearAiResult(); });
        $("#pmm-save-manual-changes-btn").on("click touchend", (e) => { e.preventDefault(); handleSaveManualChanges(); });

        // -- 删除视图的事件
        deleteView
            .find("#pmm-delete-entry-preset-select")
            .on("change", renderEntriesForDeletion);
        deleteView
            .find("#pmm-delete-selected-presets-btn")
            .on("click touchend", (e) => { e.preventDefault(); handleDeletePresets(); });
        deleteView
            .find("#pmm-delete-selected-entries-btn")
            .on("click touchend", (e) => { e.preventDefault(); handleDeleteEntries(); });

        // -- 复制视图的事件
        transferView
            .find("#pmm-source-preset-select")
            .on("change", renderEntriesForTransfer);
        const transferBtn = transferView.find("#pmm-transfer-entries-btn");
        if (transferBtn.length) {
            console.log(
                `[${extensionName}] Transfer button found. Binding click event.`
            );
            transferBtn.on("click touchend", (e) => { e.preventDefault(); handleTransferEntries(); });
        } else {
            console.error(
                `[${extensionName}] CRITICAL: Transfer button with ID #pmm-transfer-entries-btn not found!`
            );
        }

        // 5. 初始状态
        const isEnabled = localStorage.getItem(STORAGE_KEY_ENABLED) !== "false";
        $(TOGGLE_ID).prop("checked", isEnabled);
        if (isEnabled) {
            initializeFloatingButton();
        }
        $(document).on("change", TOGGLE_ID, function () {
            const checked = $(this).is(":checked");
            localStorage.setItem(STORAGE_KEY_ENABLED, checked);
            checked ? initializeFloatingButton() : destroyFloatingButton();
        });

        console.log(`[${extensionName}] Extension loaded.`);
    }

    /**
     * 安全地转义HTML字符串，防止XSS。
     * @param {any} unsafe - 要转义的字符串。
     * @returns {string}
     */
    function escapeHtml(unsafe) {
        if (unsafe === null || typeof unsafe === "undefined") return "";
        return String(unsafe)
            .replace(/&/g, "&")
            .replace(/</g, "<")
            .replace(/>/g, ">")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // 运行初始化
    try {
        await initializeExtension();
    } catch (error) {
        console.error(`[${extensionName}] Initialization failed:`, error);
        toastr.error(
            `Extension "${extensionName}" failed to initialize: ${error.message}`
        );
    }
});
