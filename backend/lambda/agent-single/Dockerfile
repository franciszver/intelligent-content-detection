FROM public.ecr.aws/lambda/python:3.11

# Copy shared modules first (build context is backend/)
COPY shared/ ${LAMBDA_TASK_ROOT}/shared/

# Copy function code (build context is backend/, so lambda/agent-single/ is the source)
COPY lambda/agent-single/ ${LAMBDA_TASK_ROOT}/

# Install all dependencies in one step (requirements.txt already includes numpy and onnxruntime)
# Add opencv-python-headless which is not in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir opencv-python-headless==4.8.1.78

# Set the CMD to your handler
CMD [ "handler.handler" ]

